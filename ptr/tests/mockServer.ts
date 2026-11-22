// A scripted mock model server speaking both the Ollama and OpenAI-compatible streaming protocols.
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export type Turn = { text?: string; toolCalls?: { name: string; args: Record<string, unknown> }[]; status?: number; error?: string; hang?: boolean }

export async function startMock(script: Turn[]) {
  const requests: Record<string, unknown>[] = []
  let i = 0
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    const json = body ? JSON.parse(body) : {}
    if (req.url === '/api/version') return res.end(JSON.stringify({ version: '0.99.0-mock' }))
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'mock:latest', size: 1234, details: { family: 'mock', parameter_size: '1B' } }] }))
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion', 'tools'], model_info: { 'mock.context_length': 8192 } }))
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'm/free:free', context_length: 4096, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }, { id: 'm/paid', pricing: { prompt: '0.001', completion: '0.002' } }] }))
    requests.push(json)
    const turn = script[Math.min(i++, script.length - 1)]
    if (turn.status) { res.statusCode = turn.status; return res.end(JSON.stringify({ error: { message: turn.error ?? 'fail' } })) }
    if (turn.hang) return // never respond: exercises timeouts / cancellation
    if (req.url === '/api/chat') {
      res.setHeader('Content-Type', 'application/x-ndjson')
      for (const ch of (turn.text ?? '').match(/.{1,5}/gs) ?? []) res.write(JSON.stringify({ message: { role: 'assistant', content: ch }, done: false }) + '\n')
      if (turn.toolCalls) res.write(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: turn.toolCalls.map((t) => ({ function: { name: t.name, arguments: t.args } })) }, done: false }) + '\n')
      res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 10, eval_count: 5 }) + '\n')
      return
    }
    if (req.url === '/v1/chat/completions') {
      res.setHeader('Content-Type', 'text/event-stream')
      const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
      for (const ch of (turn.text ?? '').match(/.{1,5}/gs) ?? []) send({ choices: [{ delta: { content: ch } }] })
      turn.toolCalls?.forEach((t, idx) => {
        const args = JSON.stringify(t.args)
        send({ choices: [{ delta: { tool_calls: [{ index: idx, id: `c${idx}`, function: { name: t.name, arguments: args.slice(0, 5) } }] } }] })
        send({ choices: [{ delta: { tool_calls: [{ index: idx, function: { arguments: args.slice(5) } }] } }] })
      })
      send({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } })
      res.end('data: [DONE]\n\n')
      return
    }
    res.statusCode = 404; res.end('{}')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()) }) }
}
