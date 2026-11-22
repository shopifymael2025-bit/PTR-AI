import type { ModelInfo, ProviderConfig } from '../../shared/types'

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON schema
}

export type ProviderMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: { id: string; name: string; args: Record<string, unknown> }[] }
  | { role: 'tool'; content: string; toolCallId: string; toolName: string }

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown>; rawArgs?: string; parseError?: string }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number }

export interface ChatRequest {
  model: string
  messages: ProviderMessage[]
  tools?: ToolSpec[]
  signal: AbortSignal
  temperature?: number
  /** Ollama only: context window to allocate (Ollama otherwise truncates long prompts silently). */
  numCtx?: number
  /** Stable id of the conversation (sent to providers that ask for it, e.g. OpenCode x-opencode-session). */
  sessionId?: string
}

export interface Provider {
  config: ProviderConfig
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  chat(req: ChatRequest): AsyncGenerator<StreamChunk>
}

export class ProviderError extends Error {
  retryAfterSec?: number
  constructor(message: string, readonly code: 'unavailable' | 'auth' | 'rate_limit' | 'not_found' | 'timeout' | 'bad_request' | 'server' | 'memory' | 'network', readonly status?: number) {
    super(message)
  }
}

export function httpError(status: number, body: string, providerName: string): ProviderError {
  const detail = extractMessage(body)
  if (status === 401 || status === 403) return new ProviderError(`${providerName}: authentication failed — check the API key. ${detail}`, 'auth', status)
  if (status === 429) {
    if (/per-day|per day|daily/i.test(detail)) return new ProviderError(`${providerName}: daily limit for free models reached. It resets in 24h; OpenRouter raises it to 1000/day once your account has bought at least $10 of credits. Use a local Ollama model meanwhile (free, no limit). ${detail}`, 'rate_limit', status)
    if (/openrouter/i.test(providerName)) return new ProviderError(`${providerName}: rate limit reached — free models share limited capacity. PTR AI retried 3 times and tried other free models. Pick another model or try again in a minute. ${detail}`, 'rate_limit', status)
    return new ProviderError(`${providerName}: rate limit reached. Wait a moment and retry. ${detail}`, 'rate_limit', status)
  }
  if (status === 404) return new ProviderError(`${providerName}: model or endpoint not found. ${detail}`, 'not_found', status)
  if (status === 402) return new ProviderError(`${providerName}: payment required — this model needs credits on your account. ${detail}`, 'auth', status)
  if (/memory/i.test(detail)) return new ProviderError(`${providerName}: not enough memory to load this model. Try a smaller model. ${detail}`, 'memory', status)
  if (status >= 500) return new ProviderError(`${providerName}: server error (${status}). ${detail}`, 'server', status)
  return new ProviderError(`${providerName}: request failed (${status}). ${detail}`, 'bad_request', status)
}

function extractMessage(body: string): string {
  try {
    const j = JSON.parse(body)
    const e = j.error ?? {}
    const base = String(e.message ?? (typeof j.error === 'string' ? j.error : '') ?? j.message ?? body)
    // OpenRouter puts the upstream provider's real reason in error.metadata.
    const meta = e.metadata ? [e.metadata.provider_name && `provider: ${e.metadata.provider_name}`, typeof e.metadata.raw === 'string' ? e.metadata.raw : e.metadata.raw && JSON.stringify(e.metadata.raw)].filter(Boolean).join(' — ') : ''
    return `${base}${meta ? ` (${meta})` : ''}`.slice(0, 600)
  } catch { return body.slice(0, 500) }
}

export function networkError(e: unknown, providerName: string, url: string): ProviderError {
  const err = e as { name?: string; message?: string; cause?: { code?: string } }
  if (err?.name === 'AbortError') throw e
  const code = err?.cause?.code
  if (code === 'ECONNREFUSED') return new ProviderError(`${providerName} is not reachable at ${url}. Is it running?`, 'unavailable')
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new ProviderError(`${providerName}: cannot resolve host — check your network connection.`, 'network')
  return new ProviderError(`${providerName}: network error — ${err?.message ?? String(e)}${code ? ` (${code})` : ''}`, 'network')
}

/** Splits a streamed body into lines. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '')
        buf = buf.slice(i + 1)
        yield line
      }
    }
    if (buf.trim()) yield buf
  } finally { reader.releaseLock() }
}
