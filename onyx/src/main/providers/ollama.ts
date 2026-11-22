// Ollama local HTTP API (https://github.com/ollama/ollama/blob/main/docs/api.md).
import type { ModelInfo, OllamaStatus, ProviderConfig, PullProgress } from '../../shared/types'
import { httpError, networkError, readLines, type ChatRequest, type Provider, type StreamChunk } from './types'

export class OllamaProvider implements Provider {
  constructor(readonly config: ProviderConfig) {}

  private url(p: string) { return this.config.baseUrl.replace(/\/+$/, '') + p }

  private async req(p: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try { res = await fetch(this.url(p), { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } }) }
    catch (e) { throw networkError(e, 'Ollama', this.config.baseUrl) }
    if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), 'Ollama')
    return res
  }

  async status(): Promise<OllamaStatus> {
    try {
      const r = await this.req('/api/version', { signal: AbortSignal.timeout(3000) })
      const j = (await r.json()) as { version?: string }
      return { running: true, version: j.version }
    } catch (e) { return { running: false, error: (e as Error).message } }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const r = await this.req('/api/tags', { signal })
    const j = (await r.json()) as { models?: { name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string; family?: string } }[] }
    const models = j.models ?? []
    return Promise.all(models.map(async (m) => {
      const info = await this.show(m.name, signal).catch(() => null)
      const d = m.details
      return {
        providerId: this.config.id, providerKind: 'ollama', id: m.name, name: m.name, local: true,
        sizeBytes: m.size, contextLength: info?.contextLength,
        toolSupport: this.config.toolSupportOverride && this.config.toolSupportOverride !== 'unknown' ? this.config.toolSupportOverride : info?.tools ?? 'unknown',
        free: true,
        details: [d?.family, d?.parameter_size, d?.quantization_level].filter(Boolean).join(' · ')
      } satisfies ModelInfo
    }))
  }

  /** /api/show reports capabilities (incl. "tools") on recent Ollama versions. */
  async show(model: string, signal?: AbortSignal): Promise<{ tools: 'yes' | 'no' | 'unknown'; contextLength?: number }> {
    const r = await this.req('/api/show', { method: 'POST', body: JSON.stringify({ model }), signal })
    const j = (await r.json()) as { capabilities?: string[]; model_info?: Record<string, unknown> }
    let ctx: number | undefined
    for (const [k, v] of Object.entries(j.model_info ?? {})) if (k.endsWith('.context_length') && typeof v === 'number') ctx = v
    const tools = Array.isArray(j.capabilities) ? (j.capabilities.includes('tools') ? 'yes' : 'no') : 'unknown'
    return { tools, contextLength: ctx }
  }

  async *pull(model: string, signal: AbortSignal): AsyncGenerator<PullProgress> {
    const r = await this.req('/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: true }), signal })
    for await (const line of readLines(r.body!)) {
      if (!line.trim()) continue
      const j = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string }
      if (j.error) { yield { model, status: 'error', error: j.error, done: true }; return }
      yield { model, status: j.status ?? '', total: j.total, completed: j.completed, done: j.status === 'success' }
    }
  }

  async deleteModel(model: string) {
    await this.req('/api/delete', { method: 'DELETE', body: JSON.stringify({ model }) })
  }

  async *chat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const messages = req.messages.map((m) => {
      if (m.role === 'assistant') return { role: 'assistant', content: m.content, tool_calls: m.toolCalls?.map((t) => ({ function: { name: t.name, arguments: t.args } })) }
      if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.toolName }
      return { role: m.role, content: m.content }
    })
    const body: Record<string, unknown> = { model: req.model, messages, stream: true }
    if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: 'function', function: t }))
    const options: Record<string, number> = {}
    if (req.temperature !== undefined) options.temperature = req.temperature
    if (req.numCtx) options.num_ctx = req.numCtx
    if (Object.keys(options).length) body.options = options
    const r = await this.req('/api/chat', { method: 'POST', body: JSON.stringify(body), signal: req.signal })
    let n = 0
    for await (const line of readLines(r.body!)) {
      if (!line.trim()) continue
      const j = JSON.parse(line) as { message?: { content?: string; thinking?: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[] }; done?: boolean; error?: string; prompt_eval_count?: number; eval_count?: number }
      if (j.error) throw httpError(500, JSON.stringify({ error: j.error }), 'Ollama')
      if (j.message?.thinking) yield { type: 'reasoning', text: j.message.thinking }
      if (j.message?.content) yield { type: 'text', text: j.message.content }
      for (const tc of j.message?.tool_calls ?? []) {
        let args = tc.function.arguments
        let parseError: string | undefined
        if (typeof args === 'string') { try { args = JSON.parse(args) } catch (e) { parseError = (e as Error).message; args = {} } }
        yield { type: 'tool_call', id: `call_${Date.now()}_${n++}`, name: tc.function.name, args: args as Record<string, unknown>, parseError }
      }
      if (j.done) yield { type: 'usage', promptTokens: j.prompt_eval_count, completionTokens: j.eval_count }
    }
  }
}
