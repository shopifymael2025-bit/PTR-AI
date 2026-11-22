import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Database } from '../src/main/services/db'
import { Workspace } from '../src/main/services/workspace'
import { OllamaProvider } from '../src/main/providers/ollama'
import { OpenAICompatProvider } from '../src/main/providers/openai'
import { AgentEngine, fitToBudget, type AgentDeps } from '../src/main/agent/engine'
import { DEFAULT_SETTINGS, type AgentEvent, type ApprovalDecision, type ProviderConfig, type Settings } from '../src/shared/types'
import { startMock, type Turn } from './mockServer'

const closers: (() => Promise<void>)[] = []
afterEach(async () => { while (closers.length) await closers.pop()!() })

async function setup(script: Turn[], opts: { kind?: 'ollama' | 'openai'; decide?: (k: string) => ApprovalDecision; settings?: Partial<Settings>; idleMs?: number; mcp?: AgentDeps['mcp'] } = {}) {
  const mock = await startMock(script)
  closers.push(mock.close)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptrai-agent-'))
  fs.writeFileSync(path.join(root, 'main.py'), 'print("hi")\n')
  const dbFile = path.join(root, '..', `ptrai-test-${Date.now()}-${Math.random()}.sqlite`)
  const db = await Database.open(dbFile)
  const proj = db.upsertProjectByPath(root, 'p')
  const ws = new Workspace(root)
  const kind = opts.kind ?? 'ollama'
  const cfg: ProviderConfig = kind === 'ollama' ? { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: mock.url, enabled: true } : { id: 'oa', kind: 'openai', name: 'OA', baseUrl: mock.url + '/v1', enabled: true }
  const events: AgentEvent[] = []
  const settings: Settings = { ...DEFAULT_SETTINGS, permissionMode: 'approval', ...opts.settings }
  const approvalsAsked: string[] = []
  let engine!: AgentEngine
  const deps: AgentDeps = {
    db, getWorkspace: (pid) => (pid === proj.id ? ws : null),
    getProvider: () => (kind === 'ollama' ? new OllamaProvider(cfg) : new OpenAICompatProvider(cfg, 'sk-test')),
    getToolSupport: () => 'yes', settings: () => settings,
    emit: (e) => { events.push(e); if (e.type === 'approval') approvalsAsked.push(e.request.kind); if (e.type === 'approval') setTimeout(() => engine.resolveApproval(e.request.id, opts.decide?.(e.request.kind) ?? 'allow'), 5) },
    getAllowlist: () => [], addToAllowlist: () => {}, inferenceIdleTimeoutMs: opts.idleMs, mcp: opts.mcp
  }
  engine = new AgentEngine(deps)
  const conv = db.createConversation(proj.id)
  return { mock, root, db, dbFile, conv, engine, events, cfg, proj, approvalsAsked }
}

describe('Permission modes', () => {
  it('Auto: edits and safe commands run without asking; dangerous commands and deletes ask', async () => {
    const s = await setup([
      { toolCalls: [{ name: 'write_file', args: { path: 'main.py', content: 'print("auto")\n' } }] },
      { toolCalls: [{ name: 'run_command', args: { command: 'echo safe' } }] },
      { toolCalls: [{ name: 'run_command', args: { command: 'Remove-Item -Recurse -Force sub' } }] },
      { toolCalls: [{ name: 'delete_file', args: { path: 'main.py' } }] },
      { text: 'done' }
    ], { settings: { permissionMode: 'auto' }, decide: () => 'deny' })
    fs.mkdirSync(path.join(s.root, 'sub'))
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.approvalsAsked).toEqual(['command', 'delete'])
    expect(fs.existsSync(path.join(s.root, 'sub'))).toBe(true) // dangerous command denied
    expect(fs.readFileSync(path.join(s.root, 'main.py'), 'utf8')).toBe('print("auto")\n') // edit applied, delete denied
    const tools = s.db.listMessages(s.conv.id).filter((m) => m.role === 'tool')
    expect(tools[1].content).toMatch(/Exit code: 0[\s\S]*safe/)
  })
  it('All: nothing asks, deletes run', async () => {
    const s = await setup([{ toolCalls: [{ name: 'delete_file', args: { path: 'main.py' } }] }, { text: 'ok' }], { settings: { permissionMode: 'all' } })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.approvalsAsked).toEqual([])
    expect(fs.existsSync(path.join(s.root, 'main.py'))).toBe(false)
  })
  it('All: paths outside the project are still blocked', async () => {
    const s = await setup([{ toolCalls: [{ name: 'write_file', args: { path: '../outside-all.txt', content: 'x' } }] }, { text: 'ok' }], { settings: { permissionMode: 'all' } })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(fs.existsSync(path.join(s.root, '..', 'outside-all.txt'))).toBe(false)
  })
})

describe('Stall prevention', () => {
  it('nudges a model that announces a step without calling a tool', async () => {
    const s = await setup([
      { text: "I'll now create the file:" },
      { toolCalls: [{ name: 'create_file', args: { path: 'snake.py', content: 'print(1)\n' } }] },
      { text: 'Done. Summary: created snake.py.' }
    ], { settings: { permissionMode: 'auto' } })
    await s.engine.send({ convId: s.conv.id, text: 'make snake', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(fs.existsSync(path.join(s.root, 'snake.py'))).toBe(true)
    expect(s.events.some((e) => e.type === 'status' && /continue/.test(e.text))).toBe(true)
    expect(s.events.find((e) => e.type === 'run_end')).toMatchObject({ status: 'done' })
  })
  it('does not nudge a normal final answer', async () => {
    const s = await setup([{ text: 'Here is the explanation. Let me know if you need more.' }])
    await s.engine.send({ convId: s.conv.id, text: 'explain', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.mock.requests).toHaveLength(1)
  })
  it('asks Ollama for a context window large enough for the prompt', async () => {
    const s = await setup([{ text: 'ok' }])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect((s.mock.requests[0].options as { num_ctx: number }).num_ctx).toBeGreaterThanOrEqual(8192)
  })
})

describe('Model catalogs', () => {
  async function serve(body: unknown) {
    const http = await import('node:http')
    const srv = http.createServer((_q, r) => r.end(JSON.stringify(body)))
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    closers.push(() => new Promise((r) => srv.close(() => r())))
    return `http://127.0.0.1:${(srv.address() as { port: number }).port}`
  }
  it('OpenCode Zen: reads $0 cost, tool capability, context and skips non chat-completions models', async () => {
    const url = await serve({ data: [
      { id: 'big-pickle', type: 'chat', capabilities: { tools: { supported: true } }, limit: { context: 200000 }, cost: { text: { input: { price: 0 }, output: { price: 0 } } }, api: { 'chat-completions': { base_url: 'https://x/v1' } } },
      { id: 'gpt-x', type: 'chat', capabilities: { tools: { supported: true } }, cost: { text: { input: { price: 1 }, output: { price: 8 } } }, api: { 'chat-completions': {} } },
      { id: 'claude-only', type: 'chat', cost: { text: { input: { price: 3 }, output: { price: 15 } } }, api: { messages: {} } }
    ] })
    const p = new OpenAICompatProvider({ id: 'opencode', kind: 'opencode', name: 'OpenCode Zen', baseUrl: url, enabled: true }, null)
    const list = await p.listModels()
    expect(list.map((m) => m.id)).toEqual(['big-pickle', 'gpt-x'])
    expect(list[0]).toMatchObject({ free: true, toolSupport: 'yes', contextLength: 200000 })
    expect(list[1].free).toBe(false)
  })
  it('OpenAI: hides non-chat models and marks chat models as paid with tool support', async () => {
    const url = await serve({ data: [{ id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'dall-e-3' }, { id: 'o4-mini' }] })
    const p = new OpenAICompatProvider({ id: 'oa', kind: 'openai', name: 'OpenAI', baseUrl: url + '/api.openai.com/v1', enabled: true }, 'k')
    const list = await p.listModels()
    expect(list.map((m) => m.id)).toEqual(['gpt-4o-mini', 'o4-mini'])
    expect(list.every((m) => m.free === false && m.toolSupport === 'yes')).toBe(true)
  })
})

describe('Providers', () => {
  it('Ollama: lists models with capabilities and context size', async () => {
    const m = await startMock([{ text: 'x' }]); closers.push(m.close)
    const p = new OllamaProvider({ id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: m.url, enabled: true })
    expect((await p.status()).running).toBe(true)
    const list = await p.listModels()
    expect(list[0]).toMatchObject({ id: 'mock:latest', local: true, toolSupport: 'yes', contextLength: 8192 })
  })
  it('Ollama: reports unavailable server clearly', async () => {
    const p = new OllamaProvider({ id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:1', enabled: true })
    expect((await p.status()).running).toBe(false)
    await expect(p.listModels()).rejects.toThrow(/not reachable|network/i)
  })
  it('OpenAI-compatible: lists models with free flag and streams tool calls split across chunks', async () => {
    const m = await startMock([{ text: 'ok', toolCalls: [{ name: 'read_file', args: { path: 'main.py' } }] }]); closers.push(m.close)
    const p = new OpenAICompatProvider({ id: 'oa', kind: 'openrouter', name: 'OR', baseUrl: m.url + '/v1', enabled: true }, 'k')
    const models = await p.listModels()
    expect(models.find((x) => x.id === 'm/free:free')).toMatchObject({ free: true, toolSupport: 'yes', contextLength: 4096 })
    expect(models.find((x) => x.id === 'm/paid')!.free).toBe(false)
    const chunks = []
    for await (const c of p.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], signal: new AbortController().signal })) chunks.push(c)
    expect(chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('')).toBe('ok')
    expect(chunks.find((c) => c.type === 'tool_call')).toMatchObject({ name: 'read_file', args: { path: 'main.py' } })
    expect(chunks.find((c) => c.type === 'usage')).toMatchObject({ promptTokens: 12 })
  })
  it('OpenRouter: retries a rate-limited free model and sends free fallback models', async () => {
    const m = await startMock([{ status: 429, error: 'Provider returned error' }, { text: 'recovered' }]); closers.push(m.close)
    const p = new OpenAICompatProvider({ id: 'or', kind: 'openrouter', name: 'OpenRouter', baseUrl: m.url + '/v1', enabled: true }, 'k', () => ['a/one:free', 'b/two:free', 'c/three:free'])
    p.retryDelays = [10, 10, 10]
    let text = ''
    for await (const c of p.chat({ model: 'x/main:free', messages: [{ role: 'user', content: 'hi' }], signal: new AbortController().signal })) if (c.type === 'text') text += c.text
    expect(text).toBe('recovered')
    expect(m.requests).toHaveLength(2)
    expect(m.requests[1].models).toEqual(['x/main:free', 'a/one:free', 'b/two:free'])
  })
  it('OpenRouter: does not retry when the daily free quota is exhausted, and explains it', async () => {
    const m = await startMock([{ status: 429, error: 'Rate limit exceeded: free-models-per-day' }]); closers.push(m.close)
    const p = new OpenAICompatProvider({ id: 'or', kind: 'openrouter', name: 'OpenRouter', baseUrl: m.url + '/v1', enabled: true }, 'k')
    p.retryDelays = [10, 10, 10]
    await expect(p.chat({ model: 'x:free', messages: [], signal: new AbortController().signal }).next()).rejects.toThrow(/daily limit/)
    expect(m.requests).toHaveLength(1)
  })
  it('maps HTTP errors to useful messages', async () => {
    const m = await startMock([{ status: 401, error: 'bad key' }]); closers.push(m.close)
    const p = new OpenAICompatProvider({ id: 'oa', kind: 'openai', name: 'OA', baseUrl: m.url + '/v1', enabled: true }, 'k')
    const gen = p.chat({ model: 'm', messages: [], signal: new AbortController().signal })
    await expect(gen.next()).rejects.toThrow(/authentication failed/i)
  })
})

describe('Agent engine', () => {
  for (const kind of ['ollama', 'openai'] as const) {
    it(`[${kind}] runs a multi-step task: read → write (approved) → run → finish`, async () => {
      const s = await setup([
        { toolCalls: [{ name: 'read_file', args: { path: 'main.py' } }] },
        { toolCalls: [{ name: 'write_file', args: { path: 'main.py', content: 'print("hello ptrai")\n' } }] },
        { toolCalls: [{ name: 'run_command', args: { command: 'echo done' } }] },
        { text: 'All done.' }
      ], { kind })
      await s.engine.send({ convId: s.conv.id, text: 'change greeting', mode: 'build', providerId: s.cfg.id, model: 'mock' })
      expect(fs.readFileSync(path.join(s.root, 'main.py'), 'utf8')).toBe('print("hello ptrai")\n')
      const msgs = s.db.listMessages(s.conv.id)
      const tools = msgs.filter((m) => m.role === 'tool')
      expect(tools.map((t) => t.toolName)).toEqual(['read_file', 'write_file', 'run_command'])
      expect(tools[2].content).toMatch(/Exit code: 0[\s\S]*done/)
      expect(msgs[msgs.length - 1].content).toBe('All done.')
      expect(s.db.listChanges(s.conv.id)).toHaveLength(1)
      expect(s.events.some((e) => e.type === 'run_end' && e.status === 'done')).toBe(true)
      // The model received tool results on the follow-up request.
      expect(JSON.stringify(s.mock.requests[1])).toContain('print(\\"hi\\")')
    })
  }

  it('does not write when the user rejects the edit', async () => {
    const s = await setup([{ toolCalls: [{ name: 'write_file', args: { path: 'main.py', content: 'evil' } }] }, { text: 'ok' }], { decide: () => 'deny' })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(fs.readFileSync(path.join(s.root, 'main.py'), 'utf8')).toBe('print("hi")\n')
    expect(s.db.listMessages(s.conv.id).find((m) => m.role === 'tool')!.toolMeta).toMatchObject({ ok: false, denied: true })
  })

  it('blocks path traversal from model tool calls', async () => {
    const s = await setup([{ toolCalls: [{ name: 'write_file', args: { path: '../escape.txt', content: 'x' } }] }, { text: 'ok' }])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(fs.existsSync(path.join(s.root, '..', 'escape.txt'))).toBe(false)
    expect(s.db.listMessages(s.conv.id).find((m) => m.role === 'tool')!.content).toMatch(/outside the workspace/)
  })

  it('ASK mode refuses write tools even if the model calls them', async () => {
    const s = await setup([{ toolCalls: [{ name: 'write_file', args: { path: 'main.py', content: 'x' } }] }, { text: 'ok' }])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'ask', providerId: 'ollama', model: 'mock' })
    expect(fs.readFileSync(path.join(s.root, 'main.py'), 'utf8')).toBe('print("hi")\n')
    expect(s.db.listMessages(s.conv.id).find((m) => m.role === 'tool')!.content).toMatch(/not permitted/)
    // Only read-only tools were offered to the model.
    const offered = (s.mock.requests[0].tools as { function: { name: string } }[]).map((t) => t.function.name)
    expect(offered).not.toContain('write_file')
  })

  it('denied commands are not executed', async () => {
    const s = await setup([{ toolCalls: [{ name: 'run_command', args: { command: 'New-Item -ItemType File pwned.txt' } }] }, { text: 'ok' }], { decide: () => 'deny' })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(fs.existsSync(path.join(s.root, 'pwned.txt'))).toBe(false)
  })

  it('apply_patch requires a unique exact match', async () => {
    const s = await setup([
      { toolCalls: [{ name: 'apply_patch', args: { path: 'main.py', edits: [{ old_text: 'nope', new_text: 'x' }] } }] },
      { toolCalls: [{ name: 'apply_patch', args: { path: 'main.py', edits: [{ old_text: '"hi"', new_text: '"patched"' }] } }] },
      { text: 'ok' }
    ])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    const tools = s.db.listMessages(s.conv.id).filter((m) => m.role === 'tool')
    expect(tools[0].content).toMatch(/not found/)
    expect(fs.readFileSync(path.join(s.root, 'main.py'), 'utf8')).toBe('print("patched")\n')
  })

  it('detects external modification since the last read', async () => {
    const s = await setup([
      { toolCalls: [{ name: 'read_file', args: { path: 'main.py' } }] },
      { toolCalls: [{ name: 'write_file', args: { path: 'main.py', content: 'agent' } }] },
      { text: 'ok' }
    ])
    s.events.length = 0
    const p = s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    // modify between read and write
    await new Promise((r) => setTimeout(r, 0))
    const wait = async () => { while (!s.db.listMessages(s.conv.id).some((m) => m.toolName === 'read_file')) await new Promise((r) => setTimeout(r, 2)) }
    await wait(); fs.writeFileSync(path.join(s.root, 'main.py'), 'user edit\n')
    await p
    expect(fs.readFileSync(path.join(s.root, 'main.py'), 'utf8')).toBe('user edit\n')
    expect(s.db.listMessages(s.conv.id).filter((m) => m.role === 'tool')[1].content).toMatch(/modified outside/)
  })

  it('stops infinite loops of identical calls', async () => {
    const s = await setup([{ toolCalls: [{ name: 'list_directory', args: {} }] }])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.events.find((e) => e.type === 'run_end')).toMatchObject({ status: 'error', error: expect.stringMatching(/Loop detected/) })
  })

  it('respects the iteration limit', async () => {
    let n = 0
    const script: Turn[] = Array.from({ length: 10 }, () => ({ toolCalls: [{ name: 'read_file', args: { path: 'main.py', start_line: ++n } }] }))
    const s = await setup(script, { settings: { maxIterations: 3 } })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.events.find((e) => e.type === 'run_end')).toMatchObject({ status: 'limit' })
  })

  it('can be cancelled while the model is hanging', async () => {
    const s = await setup([{ hang: true }])
    const p = s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    setTimeout(() => s.engine.cancel(s.conv.id), 100)
    await p
    expect(s.events.find((e) => e.type === 'run_end')).toMatchObject({ status: 'cancelled' })
  })

  it('times out an unresponsive model', async () => {
    const s = await setup([{ hang: true }], { idleMs: 300 })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    const end = s.events.find((e) => e.type === 'run_end')!
    expect(end).toMatchObject({ error: expect.stringMatching(/timeout/i) })
  })

  it('surfaces provider errors instead of fake success', async () => {
    const s = await setup([{ status: 429, error: 'slow down' }])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.events.find((e) => e.type === 'run_end')).toMatchObject({ status: 'error', error: expect.stringMatching(/rate limit/i) })
    expect(s.db.listMessages(s.conv.id).some((m) => m.error)).toBe(true)
  })

  it('PLAN mode stops after submit_plan and resumes on approval', async () => {
    const s = await setup([
      { toolCalls: [{ name: 'submit_plan', args: { summary: 'Do it', steps: [{ title: 'Edit main.py' }] } }] },
      { toolCalls: [{ name: 'update_plan_step', args: { index: 0, status: 'done' } }] },
      { text: 'Implemented.' }
    ])
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'plan', providerId: 'ollama', model: 'mock' })
    expect(s.events.find((e) => e.type === 'run_end')).toMatchObject({ status: 'awaiting_plan' })
    expect(s.db.getConversation(s.conv.id)!.plan).toMatchObject({ approved: false })
    await s.engine.approvePlan(s.conv.id, 'ollama', 'mock')
    expect(s.db.getConversation(s.conv.id)!.plan!.steps[0].status).toBe('done')
  })
})

describe('Persistence', () => {
  it('conversation history survives reopening the database', async () => {
    const s = await setup([{ text: 'persisted answer' }])
    await s.engine.send({ convId: s.conv.id, text: 'remember me', mode: 'build', providerId: 'ollama', model: 'mock' })
    s.db.flush()
    const db2 = await Database.open(s.dbFile)
    const msgs = db2.listMessages(s.conv.id)
    expect(msgs.map((m) => m.content)).toEqual(['remember me', 'persisted answer'])
    expect(db2.listConversations(s.proj.id)[0].title).toBe('remember me')
  })
  it('recovers from a corrupted database file', async () => {
    const f = path.join(os.tmpdir(), `ptrai-corrupt-${Date.now()}.sqlite`)
    fs.writeFileSync(f, 'this is not sqlite')
    const db = await Database.open(f)
    expect(db.recoveredFrom).toMatch(/corrupt/)
    expect(db.listProjects()).toEqual([])
  })
  it('keeps conversations isolated per project', async () => {
    const db = await Database.open(null)
    const a = db.upsertProjectByPath('C:\\a', 'a'), b = db.upsertProjectByPath('C:\\b', 'b')
    db.createConversation(a.id, { title: 'A' }); db.createConversation(b.id, { title: 'B' })
    expect(db.listConversations(a.id).map((c) => c.title)).toEqual(['A'])
    expect(db.listConversations(b.id).map((c) => c.title)).toEqual(['B'])
  })
})

describe('Context budget', () => {
  it('trims old messages and leaves a summary', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `message ${i} ` + 'x'.repeat(400) }))
    const r = fitToBudget(msgs, 2000)
    expect(r.messages.length).toBeLessThan(40)
    expect(r.messages[0].role).toBe('user')
    expect(r.summary).toMatch(/Earlier user requests/)
  })
})


describe('MCP tools in the agent', () => {
  function fakeMcp(calls: string[]) {
    const tools = [
      { serverId: 'rbx', serverName: 'Roblox Studio', publicName: 'mcp__rbx__script_read', tool: { name: 'script_read', description: 'Read a script', inputSchema: { type: 'object', properties: { path: { type: 'string' } } }, readOnly: true, destructive: false } },
      { serverId: 'rbx', serverName: 'Roblox Studio', publicName: 'mcp__rbx__execute_luau', tool: { name: 'execute_luau', description: 'Run Luau', inputSchema: { type: 'object', properties: { code: { type: 'string' } } }, readOnly: false, destructive: true } },
      { serverId: 'rbx', serverName: 'Roblox Studio', publicName: 'mcp__rbx__generate_mesh', tool: { name: 'generate_mesh', description: 'Make a mesh', inputSchema: { type: 'object' }, readOnly: false, destructive: false } }
    ]
    return { tools: () => tools, alwaysAsk: () => false, call: async (_s: string, tool: string, args: Record<string, unknown>) => { calls.push(`${tool}:${JSON.stringify(args)}`); return { ok: true, text: `${tool} done` } } }
  }

  it('offers MCP tools to the model and runs them (Auto: non-destructive without asking)', async () => {
    const calls: string[] = []
    const s = await setup([{ toolCalls: [{ name: 'mcp__rbx__generate_mesh', args: { prompt: 'tree' } }] }, { text: 'ok' }], { settings: { permissionMode: 'auto' }, mcp: fakeMcp(calls) })
    await s.engine.send({ convId: s.conv.id, text: 'make a tree', mode: 'build', providerId: 'ollama', model: 'mock' })
    const offered = (s.mock.requests[0].tools as { function: { name: string } }[]).map((t) => t.function.name)
    expect(offered).toEqual(expect.arrayContaining(['mcp__rbx__script_read', 'mcp__rbx__execute_luau', 'mcp__rbx__generate_mesh', 'read_file']))
    expect(calls).toEqual(['generate_mesh:{"prompt":"tree"}'])
    expect(s.approvalsAsked).toEqual([])
    expect(s.db.listMessages(s.conv.id).find((m) => m.role === 'tool')!.content).toBe('generate_mesh done')
  })

  it('Auto: destructive MCP tools ask first, and a denial means no call', async () => {
    const calls: string[] = []
    const s = await setup([{ toolCalls: [{ name: 'mcp__rbx__execute_luau', args: { code: 'workspace:ClearAllChildren()' } }] }, { text: 'ok' }], { settings: { permissionMode: 'auto' }, mcp: fakeMcp(calls), decide: () => 'deny' })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(s.approvalsAsked).toEqual(['mcp'])
    expect(calls).toEqual([])
  })

  it('Ask mode only offers read-only MCP tools', async () => {
    const s = await setup([{ text: 'ok' }], { mcp: fakeMcp([]) })
    await s.engine.send({ convId: s.conv.id, text: 'x', mode: 'ask', providerId: 'ollama', model: 'mock' })
    const offered = (s.mock.requests[0].tools as { function: { name: string } }[]).map((t) => t.function.name).filter((n) => n.startsWith('mcp__'))
    expect(offered).toEqual(['mcp__rbx__script_read'])
  })

  it('MCP tools work in a conversation without a project', async () => {
    const calls: string[] = []
    const s = await setup([{ toolCalls: [{ name: 'mcp__rbx__script_read', args: { path: 'Workspace.Script' } }] }, { text: 'ok' }], { settings: { permissionMode: 'approval' }, mcp: fakeMcp(calls) })
    const conv = s.db.createConversation(null)
    await s.engine.send({ convId: conv.id, text: 'read it', mode: 'build', providerId: 'ollama', model: 'mock' })
    expect(calls).toEqual(['script_read:{"path":"Workspace.Script"}'])
    expect(s.approvalsAsked).toEqual([]) // read-only tools never ask
  })
})
