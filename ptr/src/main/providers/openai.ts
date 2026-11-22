// OpenAI-compatible Chat Completions provider (also used for OpenRouter).
import type { ModelInfo, ProviderConfig } from '../../shared/types'
import { httpError, networkError, readLines, ProviderError, type ChatRequest, type Provider, type StreamChunk } from './types'

interface RawModel {
  id: string; name?: string; type?: string; context_length?: number
  pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[]
  cost?: { text?: { input?: { price?: number }; output?: { price?: number } } }
  capabilities?: { tools?: { supported?: boolean } }; limit?: { context?: number }
  api?: Record<string, { base_url?: string } | undefined>
}
const NON_CHAT = /embed|whisper|tts|dall-e|moderation|davinci|babbage|text-similarity|image|audio|realtime|transcribe|computer-use|sora/i
/** Some catalogs (OpenCode Zen) serve chat from a different base URL than the model list. */
const chatUrls = new Map<string, string>()

/** Identifies PTR AI to providers (OpenCode requires a client-specific User-Agent). Set at startup. */
let clientUserAgent = 'PTR AI'
export function setClientUserAgent(ua: string) { clientUserAgent = ua }

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })) }, { once: true })
})

export class OpenAICompatProvider implements Provider {
  /** Delays between retries of rate-limited/overloaded requests (ms). Overridable for tests. */
  retryDelays = [2000, 5000, 10000]
  constructor(readonly config: ProviderConfig, private apiKey: string | null, private fallbackModels: () => string[] = () => []) {}

  private url(p: string) { return this.config.baseUrl.replace(/\/+$/, '') + p }

  private headers(sessionId?: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': clientUserAgent, ...(this.config.headers ?? {}) }
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey.replace(/^Bearer\s+/i, '').trim()}`
    if (this.config.kind === 'openrouter') { h['HTTP-Referer'] = h['HTTP-Referer'] ?? 'https://ptrai.local'; h['X-Title'] = h['X-Title'] ?? 'PTR AI' }
    // OpenCode asks third-party clients for their own User-Agent and a stable session id per conversation.
    if (this.config.kind === 'opencode' && sessionId) h['x-opencode-session'] = sessionId
    return h
  }

  private async req(p: string, init: RequestInit = {}, base?: string, sessionId?: string): Promise<Response> {
    let res: Response
    const url = base ? base.replace(/\/+$/, '') + p : this.url(p)
    try { res = await fetch(url, { ...init, headers: this.headers(sessionId) }) }
    catch (e) { throw networkError(e, this.config.name, this.config.baseUrl) }
    if (!res.ok) {
      const err = httpError(res.status, await res.text().catch(() => ''), this.config.name)
      if (this.config.kind === 'opencode' && res.status === 401) {
        const go = /\/zen\/go\//.test(this.config.baseUrl)
        err.message += go
          ? ' — This provider expects an OpenCode Go subscription key. For a Zen pay-as-you-go key, use the “OpenCode Zen” provider instead.'
          : ' — If this is an OpenCode Go subscription key, put it in the “OpenCode Go” provider instead (Settings → Models). Zen free models also work with no key at all.'
      }
      const ra = Number(res.headers.get('retry-after'))
      if (Number.isFinite(ra) && ra > 0) err.retryAfterSec = ra
      throw err
    }
    return res
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const r = await this.req('/models', { signal })
    const j = (await r.json()) as { data?: RawModel[] }
    const override = this.config.toolSupportOverride
    const isOpenAI = /api\.openai\.com/i.test(this.config.baseUrl)
    const out: ModelInfo[] = []
    for (const m of j.data ?? []) {
      // Skip models that cannot be used through Chat Completions (embeddings, audio, images, Anthropic-only API…).
      if (NON_CHAT.test(m.id)) continue
      if (m.type && m.type !== 'chat') continue
      if (m.api && !m.api['chat-completions']) continue
      const chatBase = m.api?.['chat-completions']?.base_url
      if (chatBase) chatUrls.set(`${this.config.id}::${m.id}`, chatBase)

      // Pricing: OpenRouter `pricing`, OpenCode Zen `cost`; OpenAI's API is always paid; otherwise unknown.
      let free: boolean | undefined
      if (m.pricing && m.pricing.prompt !== undefined) free = Number(m.pricing.prompt) === 0 && Number(m.pricing.completion ?? 0) === 0
      else if (m.cost?.text) free = Number(m.cost.text.input?.price ?? 1) === 0 && Number(m.cost.text.output?.price ?? 1) === 0
      else if (isOpenAI) free = false

      let reported: ModelInfo['toolSupport'] = 'unknown'
      if (Array.isArray(m.supported_parameters)) reported = m.supported_parameters.includes('tools') ? 'yes' : 'no'
      else if (typeof m.capabilities?.tools?.supported === 'boolean') reported = m.capabilities.tools.supported ? 'yes' : 'no'
      else if (isOpenAI && /^(gpt-4|gpt-5|o\d)/.test(m.id)) reported = 'yes'

      out.push({
        providerId: this.config.id, providerKind: this.config.kind, id: m.id, name: m.name ?? m.id, local: false,
        contextLength: m.context_length ?? m.limit?.context, toolSupport: override && override !== 'unknown' ? override : reported, free
      })
    }
    return out.sort((a, b) => Number(b.free === true) - Number(a.free === true) || a.id.localeCompare(b.id))
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const messages = req.messages.map((m) => {
      if (m.role === 'assistant') {
        const out: Record<string, unknown> = { role: 'assistant', content: m.content || null }
        if (m.toolCalls?.length) out.tool_calls = m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } }))
        return out
      }
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
      return { role: m.role, content: m.content }
    })
    const body: Record<string, unknown> = { model: req.model, messages, stream: true, stream_options: { include_usage: true } }
    if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: 'function', function: t }))
    if (req.temperature !== undefined) body.temperature = req.temperature
    // OpenRouter: when a free model is busy, let OpenRouter route to other free models (its `models` fallback list).
    if (this.config.kind === 'openrouter' && req.model.endsWith(':free')) {
      const fb = this.fallbackModels().filter((m) => m !== req.model).slice(0, 2)
      if (fb.length) body.models = [req.model, ...fb]
    }
    const payload = JSON.stringify(body)
    let r!: Response
    for (let attempt = 0; ; attempt++) {
      try { r = await this.req('/chat/completions', { method: 'POST', body: payload, signal: req.signal }, chatUrls.get(`${this.config.id}::${req.model}`), req.sessionId); break }
      catch (e) {
        // Don't retry quota errors or when the server asks to wait longer than 30 s.
        const retryable = e instanceof ProviderError && (e.status === 429 || e.status === 502 || e.status === 503)
          && !/per-day|daily|usage limit/i.test(e.message) && !((e.retryAfterSec ?? 0) > 30)
        if (!retryable || attempt >= this.retryDelays.length) throw e
        await sleep(this.retryDelays[attempt], req.signal)
      }
    }

    const pending = new Map<number, { id: string; name: string; args: string }>()
    for await (const line of readLines(r.body!)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') break
      let j: { error?: { message?: string }; choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
      try { j = JSON.parse(data) } catch { continue }
      if (j.error) throw new ProviderError(`${this.config.name}: ${j.error.message ?? 'stream error'}`, 'server')
      const delta = j.choices?.[0]?.delta
      if (delta?.reasoning || delta?.reasoning_content) yield { type: 'reasoning', text: (delta.reasoning ?? delta.reasoning_content)! }
      if (delta?.content) yield { type: 'text', text: delta.content }
      for (const tc of delta?.tool_calls ?? []) {
        const cur = pending.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}_${Date.now()}`, name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name += tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        pending.set(tc.index, cur)
      }
      if (j.usage) yield { type: 'usage', promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens }
    }
    for (const t of pending.values()) {
      let args: Record<string, unknown> = {}
      let parseError: string | undefined
      try { args = t.args.trim() ? JSON.parse(t.args) : {} } catch (e) { parseError = (e as Error).message }
      yield { type: 'tool_call', id: t.id, name: t.name, args, rawArgs: t.args, parseError }
    }
  }
}
