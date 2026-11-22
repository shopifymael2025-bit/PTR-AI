import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { z } from 'zod'
import { Database } from './services/db'
import { ConfigStore } from './services/config'
import { AccountStore } from './services/accounts'
import { Workspace } from './services/workspace'
import { TerminalService } from './services/terminal'
import { UpdateService, feedUrl } from './services/updater'
import { McpManager, detectPresets, importFromClaude } from './services/mcp'
import { gitCommit, gitDiff, gitLog, gitStage, gitStatus, gitUnstage } from './services/git'
import { OllamaProvider } from './providers/ollama'
import { OpenAICompatProvider, setClientUserAgent } from './providers/openai'
import type { Provider } from './providers/types'
import { AgentEngine } from './agent/engine'
import type { InvokeChannel } from '../shared/ipc'
import { TOS_VERSION } from '../shared/app'
import type { ModelInfo, ProviderConfig, Settings, ToolSupport } from '../shared/types'

const isDev = !!process.env.ELECTRON_RENDERER_URL
// PTR AI has its own, brand-new data storage (%APPDATA%/PTR AI, ~/Library/Application Support/PTR AI…).
// It never reads or touches the data of the former app (settings, API keys, conversations, database).
app.setName('PTR AI')
// Allows isolated profiles (used by the end-to-end tests).
if (process.env.PTRAI_USER_DATA) app.setPath('userData', process.env.PTRAI_USER_DATA)
else app.setPath('userData', path.join(app.getPath('appData'), 'PTR AI'))
if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let db: Database
let config: ConfigStore
let accounts: AccountStore
let engine: AgentEngine
const terminals = new TerminalService()
const workspaces = new Map<string, Workspace>()
const toolSupportCache = new Map<string, ToolSupport>()
const contextCache = new Map<string, number>()
const pulls = new Map<string, AbortController>()
let updates: UpdateService
let mcp: McpManager

// ---------------- providers ----------------
function makeProvider(p: ProviderConfig): Provider {
  if (p.kind === 'ollama') return new OllamaProvider(p)
  return new OpenAICompatProvider(p, config.getKey(p.id), () => freeToolModels.get(p.id) ?? [])
}
/** Per provider: free models that report tool support — used as OpenRouter fallbacks when a free model is busy. */
const freeToolModels = new Map<string, string[]>()
function providerById(id: string): Provider {
  const p = config.provider(id)
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return makeProvider(p)
}
function ollama(): OllamaProvider {
  const p = config.providers().find((x) => x.kind === 'ollama')
  if (!p) throw new Error('No Ollama provider configured')
  return new OllamaProvider(p)
}

function workspaceFor(projectId: string | null): Workspace | null {
  if (!projectId) return null
  const cached = workspaces.get(projectId)
  if (cached) return cached
  const proj = db.getProject(projectId)
  if (!proj) return null
  try { const ws = new Workspace(proj.path); workspaces.set(projectId, ws); return ws } catch { return null }
}
function requireWs(projectId: string): Workspace {
  const ws = workspaceFor(projectId)
  if (!ws) throw new Error('Project folder is not available (moved or deleted?)')
  return ws
}

// ---------------- IPC plumbing ----------------
function trustedSender(e: IpcMainInvokeEvent) {
  const url = e.senderFrame?.url ?? ''
  if (isDev) return url.startsWith(process.env.ELECTRON_RENDERER_URL!)
  return url.startsWith('file://')
}
function handle<S extends z.ZodTypeAny>(channel: InvokeChannel, schema: S, fn: (payload: z.infer<S>, e: IpcMainInvokeEvent) => unknown) {
  ipcMain.handle(channel, async (e, payload) => {
    if (!trustedSender(e)) throw new Error('Untrusted IPC sender')
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid request for ${channel}: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    return fn(parsed.data, e)
  })
}
const none = z.undefined().or(z.null()).or(z.object({}).strict())
const id = z.string().min(1).max(200)
const relPath = z.string().max(2000)

/** The agent only runs once the Terms are accepted and no mandatory update is pending (enforced here, not only in the UI). */
function assertUsable() {
  if (config.settings.tosAcceptedVersion !== TOS_VERSION) throw new Error('You must accept the Terms of Service before using PTR AI.')
  if (!accounts.isSignedIn()) throw new Error('You must sign in to your PTR AI account before using the app.')
  if (updates.blocking) throw new Error('A mandatory update must be installed before you can continue.')
}

function registerIpc() {
  handle('window:minimize', none, () => win?.minimize())
  handle('window:maximize', none, () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  handle('window:close', none, () => win?.close())
  handle('window:isMaximized', none, () => win?.isMaximized() ?? false)

  handle('app:info', none, () => ({ version: app.getVersion(), os: process.platform, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, platform: `${process.platform} ${process.arch}`, encryption: config.encryptionAvailable, dbRecoveredFrom: db.recoveredFrom, terminalError: terminals.loadError }))
  handle('app:openExternal', z.string().url(), (url) => {
    if (!/^https:\/\//.test(url)) throw new Error('Only https links can be opened')
    return shell.openExternal(url)
  })
  handle('app:dataDir', none, () => { shell.openPath(app.getPath('userData')); return app.getPath('userData') })
  handle('app:exportConversations', none, async () => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `ptrai-conversations-${Date.now()}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return null
    const data = { exportedAt: new Date().toISOString(), projects: db.listProjects(), conversations: db.allConversations().map((c) => ({ ...c, messages: db.listMessages(c.id) })) }
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2))
    return r.filePath
  })
  handle('app:clearHistory', none, () => { db.clearAll(); db.flush(); return true })
  handle('app:diagnostics', none, async () => {
    const o = await ollama().status().catch((e) => ({ running: false, error: String(e) }))
    const g = await gitStatus(app.getPath('home'))
    return { ollama: o, git: g.available, terminal: terminals.loadError ?? 'ok', dataDir: app.getPath('userData'), encryption: config.encryptionAvailable }
  })

  handle('settings:get', none, () => config.settings)
  handle('settings:set', z.record(z.string(), z.unknown()), (patch) => {
    // The update feed is fixed in code (OFFICIAL_UPDATE_URL) and can never be changed through settings.
    delete patch.updateUrl
    // Terms acceptance can only be recorded through tos:accept, never through a generic settings patch.
    delete patch.tosAcceptedVersion; delete patch.tosAcceptedAt
    const s = config.setSettings(patch as Partial<Settings>)
    nativeTheme.themeSource = s.theme
    return s
  })
  handle('tos:accept', z.object({ version: z.literal(TOS_VERSION) }), () => config.setSettings({ tosAcceptedVersion: TOS_VERSION, tosAcceptedAt: Date.now() }))

  // Local accounts (sign-up / sign-in)
  handle('auth:status', none, () => accounts.status())
  handle('auth:register', z.object({ username: z.string().max(64), email: z.string().max(254), password: z.string().max(200), remember: z.boolean() }), (p) => accounts.register(p))
  handle('auth:login', z.object({ identifier: z.string().min(1).max(254), password: z.string().max(200), remember: z.boolean() }), (p) => accounts.login(p))
  handle('auth:logout', none, () => accounts.logout())

  // MCP servers
  const mcpSchema = z.object({
    id, name: z.string().min(1).max(80), enabled: z.boolean(), transport: z.enum(['stdio', 'http']),
    command: z.string().max(2000).optional(), args: z.array(z.string().max(2000)).max(64).optional(),
    env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(4000)).optional(),
    url: z.string().url().optional(), alwaysAsk: z.boolean().optional(), hasSecrets: z.boolean().optional()
  })
  const mcpList = () => ({ servers: config.mcpServers(), states: mcp.list() })
  handle('mcp:list', none, () => mcpList())
  handle('mcp:save', z.object({ server: mcpSchema, secrets: z.record(z.string().max(200), z.string().max(8000)).nullable().optional() }), async ({ server, secrets }) => {
    if (server.transport === 'http' && server.url && !/^https:\/\//.test(server.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(server.url)) throw new Error('Remote MCP servers must use https://')
    config.saveMcpServer(server, secrets)
    await mcp.restart(server.id)
    return mcpList()
  })
  handle('mcp:remove', id, async (sid) => { await mcp.disconnect(sid); config.removeMcpServer(sid); await mcp.syncAll(); return mcpList() })
  handle('mcp:restart', id, async (sid) => { await mcp.restart(sid); return mcpList() })
  handle('mcp:detect', none, () => detectPresets())
  handle('mcp:importClaude', none, async () => {
    const existing = new Set(config.mcpServers().map((m) => m.name.toLowerCase()))
    let added = 0
    for (const s of importFromClaude()) {
      if (existing.has(s.name.toLowerCase())) continue
      const sid = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `mcp-${Date.now().toString(36)}`
      // Environment variables from imported configs may hold tokens: store them encrypted.
      config.saveMcpServer({ id: sid, name: s.name, enabled: true, transport: s.transport, command: s.command, args: s.args, url: s.url }, s.env && Object.keys(s.env).length ? s.env : undefined)
      added++
    }
    await mcp.syncAll()
    return { added, ...mcpList() }
  })

  handle('update:status', none, (_p, e) => { updates.subscribe(e.sender); return updates.current })
  handle('update:check', none, () => updates.check())
  handle('update:install', none, () => updates.install())

  const providerSchema = z.object({
    id, kind: z.enum(['ollama', 'openai', 'openrouter', 'opencode']), name: z.string().min(1).max(100), baseUrl: z.string().url(), enabled: z.boolean(),
    headers: z.record(z.string(), z.string()).optional(), toolSupportOverride: z.enum(['yes', 'no', 'unknown']).optional(), hasKey: z.boolean().optional()
  })
  handle('providers:list', none, () => config.providers())
  handle('providers:save', providerSchema, (p) => {
    const lower = Object.keys(p.headers ?? {}).map((k) => k.toLowerCase())
    if (lower.includes('authorization')) throw new Error('Put API keys in the API key field so they are stored encrypted, not in headers.')
    config.saveProvider(p); return config.providers()
  })
  handle('providers:remove', id, (pid) => { config.removeProvider(pid); return config.providers() })
  handle('providers:setKey', z.object({ id, key: z.string().max(500).nullable() }), ({ id: pid, key }) => { config.setKey(pid, key?.trim() || null); return config.providers() })
  handle('providers:test', id, async (pid) => {
    try { const models = await providerById(pid).listModels(AbortSignal.timeout(15000)); return { ok: true, count: models.length } }
    catch (e) { return { ok: false, error: (e as Error).message } }
  })

  handle('models:list', none, async () => {
    const models: ModelInfo[] = []
    const errors: { providerId: string; message: string }[] = []
    await Promise.all(config.providers().filter((p) => p.enabled).map(async (p) => {
      try {
        if (p.kind === 'openrouter' && !config.getKey(p.id)) throw new Error('No API key set — paste your OpenRouter key in Settings → Models.')
        if (p.kind === 'openai' && !config.getKey(p.id) && !/localhost|127\.0\.0\.1/.test(p.baseUrl)) throw new Error('No API key set — paste your key in Settings → Models.')
        const list = await makeProvider(p).listModels(AbortSignal.timeout(20000))
        for (const m of list) { toolSupportCache.set(`${m.providerId}::${m.id}`, m.toolSupport); if (m.contextLength) contextCache.set(`${m.providerId}::${m.id}`, m.contextLength) }
        freeToolModels.set(p.id, list.filter((m) => m.free && m.toolSupport === 'yes').map((m) => m.id))
        models.push(...list)
      } catch (e) { errors.push({ providerId: p.id, message: (e as Error).message }) }
    }))
    return { models, errors }
  })

  handle('ollama:status', none, () => ollama().status())
  handle('ollama:pull', z.string().min(1).max(200).regex(/^[\w.\-:/]+$/), async (model, e) => {
    if (pulls.has(model)) throw new Error('Already downloading')
    const ac = new AbortController()
    pulls.set(model, ac)
    ;(async () => {
      try {
        for await (const p of ollama().pull(model, ac.signal)) e.sender.send('ollama:pullProgress', p)
      } catch (err) {
        e.sender.send('ollama:pullProgress', { model, status: ac.signal.aborted ? 'cancelled' : 'error', error: ac.signal.aborted ? undefined : (err as Error).message, done: true })
      } finally { pulls.delete(model) }
    })()
    return true
  })
  handle('ollama:cancelPull', z.string(), (model) => { pulls.get(model)?.abort(); return true })
  handle('ollama:delete', z.string().min(1), async (model) => { await ollama().deleteModel(model); return true })

  // projects
  handle('projects:list', none, () => db.listProjects().map((p) => ({ ...p, isGit: fs.existsSync(path.join(p.path, '.git')), missing: !fs.existsSync(p.path) })))
  const openPath = (dir: string) => {
    const ws = new Workspace(dir)
    const proj = db.upsertProjectByPath(ws.root, path.basename(ws.root))
    workspaces.set(proj.id, ws)
    return { ...proj, isGit: fs.existsSync(path.join(ws.root, '.git')) }
  }
  handle('projects:openDialog', none, async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Open project folder' })
    if (r.canceled || !r.filePaths[0]) return null
    return openPath(r.filePaths[0])
  })
  handle('projects:createDialog', none, async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory', 'promptToCreate'], title: 'Choose or create a folder for the new workspace', buttonLabel: 'Use this folder' })
    if (r.canceled || !r.filePaths[0]) return null
    fs.mkdirSync(r.filePaths[0], { recursive: true })
    return openPath(r.filePaths[0])
  })
  handle('projects:open', id, (pid) => {
    const p = db.getProject(pid)
    if (!p) throw new Error('Unknown project')
    return openPath(p.path) // only paths the user previously chose are re-authorized
  })
  handle('projects:remove', id, (pid) => { db.removeProject(pid); workspaces.delete(pid); return true })
  handle('projects:update', z.object({ id, modelPref: z.object({ providerId: z.string(), model: z.string() }).optional(), layout: z.any().optional(), name: z.string().max(200).optional() }), (u) => {
    const p = db.getProject(u.id)
    if (!p) throw new Error('Unknown project')
    const next = { ...p, ...(u.modelPref ? { modelPref: u.modelPref } : {}), ...(u.layout ? { layout: u.layout } : {}), ...(u.name ? { name: u.name } : {}) }
    db.saveProject(next)
    return next
  })

  // conversations
  handle('conv:list', z.object({ projectId: z.string().nullable() }), ({ projectId }) => db.listConversations(projectId).map((c) => ({ ...c, running: engine.isRunning(c.id) })))
  handle('conv:create', z.object({ projectId: z.string().nullable(), mode: z.enum(['ask', 'build', 'plan']).optional() }), ({ projectId, mode }) => db.createConversation(projectId, { mode: mode ?? config.settings.defaultMode }))
  handle('conv:rename', z.object({ id, title: z.string().min(1).max(200) }), ({ id: cid, title }) => { const c = db.getConversation(cid); if (c) db.saveConversation({ ...c, title }); return true })
  handle('conv:update', z.object({ id, pinned: z.boolean().optional(), mode: z.enum(['ask', 'build', 'plan']).optional() }), ({ id: cid, ...rest }) => {
    const c = db.getConversation(cid); if (!c) throw new Error('Unknown conversation')
    const next = { ...c, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) }
    db.saveConversation(next); return next
  })
  handle('conv:delete', id, (cid) => { engine.cancel(cid); db.deleteConversation(cid); return true })
  handle('conv:messages', id, (cid) => ({ conversation: db.getConversation(cid), messages: db.listMessages(cid), approvals: engine.pendingApprovals().filter((a) => a.convId === cid), running: engine.isRunning(cid) }))
  handle('conv:truncateFrom', z.object({ convId: id, messageId: id }), ({ convId, messageId }) => {
    if (engine.isRunning(convId)) throw new Error('Stop the running task first')
    db.truncateFrom(convId, messageId); return db.listMessages(convId)
  })

  // agent
  handle('agent:send', z.object({ convId: id, text: z.string().min(1).max(200_000), attachments: z.array(relPath).max(50).optional(), mode: z.enum(['ask', 'build', 'plan']), providerId: id, model: z.string().min(1).max(300) }), (o) => {
    assertUsable()
    engine.send(o).catch((err) => console.error('agent error', err))
    return true
  })
  handle('agent:cancel', id, (cid) => { engine.cancel(cid); return true })
  handle('agent:approve', z.object({ requestId: id, decision: z.enum(['allow', 'deny', 'always']) }), ({ requestId, decision }) => engine.resolveApproval(requestId, decision))
  handle('agent:approvePlan', z.object({ convId: id, providerId: id, model: z.string().min(1) }), ({ convId, providerId, model }) => { assertUsable(); engine.approvePlan(convId, providerId, model).catch((err) => console.error(err)); return true })

  // change review
  handle('changes:list', id, (cid) => db.listChanges(cid))
  const flip = (changeId: string, to: 'reverted' | 'applied', force: boolean) => {
    const ch = db.getChange(changeId)
    if (!ch) throw new Error('Unknown change')
    const ws = requireWs(ch.projectId)
    const target = to === 'reverted' ? ch.before : ch.after
    const expected = to === 'reverted' ? ch.after : ch.before
    const current = ws.readFull(ch.path)
    const norm = (s: string | null) => (s === null ? null : s.replace(/\r\n/g, '\n'))
    if (!force && norm(current) !== norm(expected)) throw new Error(`${ch.path} has changed since this edit. Open it in the editor to resolve manually.`)
    if (target === null) { if (current !== null) ws.remove(ch.path) } else ws.writeText(ch.path, target)
    const next = { ...ch, status: to }
    db.addChange(next)
    return next
  }
  handle('changes:revert', z.object({ id, force: z.boolean().optional() }), ({ id: cid, force }) => flip(cid, 'reverted', !!force))
  handle('changes:reapply', z.object({ id, force: z.boolean().optional() }), ({ id: cid, force }) => flip(cid, 'applied', !!force))

  // filesystem (editor/explorer) — always scoped to an authorized project
  handle('fs:list', z.object({ projectId: id, path: relPath }), ({ projectId, path: p }) => requireWs(projectId).list(p || '.'))
  handle('fs:read', z.object({ projectId: id, path: relPath }), ({ projectId, path: p }) => {
    const ws = requireWs(projectId); const r = ws.readText(p)
    return { ...r, mtime: fs.statSync(ws.resolveInside(p)).mtimeMs }
  })
  handle('fs:write', z.object({ projectId: id, path: relPath, content: z.string().max(10_000_000), expectedMtime: z.number().optional() }), ({ projectId, path: p, content, expectedMtime }) => {
    const ws = requireWs(projectId)
    const abs = ws.resolveInside(p)
    if (expectedMtime && fs.existsSync(abs) && Math.abs(fs.statSync(abs).mtimeMs - expectedMtime) > 1) throw new Error('CONFLICT: the file changed on disk since it was opened.')
    ws.writeText(p, content)
    return { mtime: fs.statSync(abs).mtimeMs }
  })
  handle('fs:searchFiles', z.object({ projectId: id, query: z.string().max(300) }), ({ projectId, query }) => {
    const ws = requireWs(projectId)
    if (!query) return ws.walk(5000).slice(0, 200)
    const q = query.toLowerCase()
    return ws.walk().map((f) => ({ f, s: fuzzyScore(f.toLowerCase(), q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 100).map((x) => x.f)
  })
  handle('fs:searchContent', z.object({ projectId: id, query: z.string().min(1).max(500), regex: z.boolean().optional() }), ({ projectId, query, regex }) => requireWs(projectId).searchContent(query, { regex, maxResults: 300 }))
  handle('fs:pickAttachment', z.object({ projectId: id, folder: z.boolean() }), async ({ projectId, folder }) => {
    const ws = requireWs(projectId)
    const r = await dialog.showOpenDialog(win!, { defaultPath: ws.root, properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'] })
    if (r.canceled) return []
    return r.filePaths.map((f) => { ws.resolveInside(f); return ws.rel(f) }) // throws for files outside the project
  })

  handle('conv:moveToProject', z.object({ convId: id, projectId: id }), ({ convId, projectId }) => {
    const c = db.getConversation(convId); if (!c) throw new Error('Unknown conversation')
    if (engine.isRunning(convId)) throw new Error('Stop the running task first')
    requireWs(projectId)
    const next = { ...c, projectId, updatedAt: Date.now() }
    db.saveConversation(next)
    return next
  })

  // Run & preview inside PTR AI
  handle('run:writeTemp', z.object({ ext: z.string().regex(/^[a-z0-9]{1,8}$/), content: z.string().max(2_000_000) }), ({ ext, content }) => {
    const dir = path.join(app.getPath('temp'), 'ptrai-snippets')
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, `snippet-${Date.now()}.${ext}`)
    fs.writeFileSync(f, content, 'utf8')
    return f
  })
  handle('run:preview', z.object({ projectId: id.optional(), path: relPath.optional(), html: z.string().max(5_000_000).optional() }), ({ projectId, path: p, html }) => {
    let file: string
    if (projectId && p) file = requireWs(projectId).resolveInside(p)
    else if (html !== undefined) { const dir = path.join(app.getPath('temp'), 'ptrai-snippets'); fs.mkdirSync(dir, { recursive: true }); file = path.join(dir, `preview-${Date.now()}.html`); fs.writeFileSync(file, html, 'utf8') }
    else throw new Error('Nothing to preview')
    // Isolated window: no preload, no Node, sandboxed. External links open in the browser.
    const pw = new BrowserWindow({ width: 1100, height: 760, title: `Preview — ${path.basename(file)}`, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    pw.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
    pw.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file://')) { ev.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url) } })
    pw.loadFile(file)
    return true
  })

  // terminal
  handle('term:create', z.object({ projectId: id.nullable().optional(), cols: z.number().int().min(2).max(1000), rows: z.number().int().min(2).max(500) }), ({ projectId, cols, rows }, e) => terminals.create(e.sender, projectId ? requireWs(projectId).root : app.getPath('home'), config.settings.terminal.shell, cols, rows))
  handle('term:write', z.object({ id, data: z.string().max(100_000) }), ({ id: tid, data }) => terminals.write(tid, data))
  handle('term:resize', z.object({ id, cols: z.number().int(), rows: z.number().int() }), ({ id: tid, cols, rows }) => terminals.resize(tid, cols, rows))
  handle('term:kill', id, (tid) => terminals.kill(tid))

  // git
  handle('git:status', id, (pid) => gitStatus(requireWs(pid).root))
  handle('git:diff', z.object({ projectId: id, path: relPath, staged: z.boolean() }), ({ projectId, path: p, staged }) => gitDiff(requireWs(projectId).root, p, staged))
  handle('git:stage', z.object({ projectId: id, paths: z.array(relPath).min(1) }), ({ projectId, paths }) => gitStage(requireWs(projectId).root, paths))
  handle('git:unstage', z.object({ projectId: id, paths: z.array(relPath).min(1) }), ({ projectId, paths }) => gitUnstage(requireWs(projectId).root, paths))
  handle('git:commit', z.object({ projectId: id, message: z.string().min(1).max(5000) }), ({ projectId, message }) => gitCommit(requireWs(projectId).root, message))
  handle('git:log', id, (pid) => gitLog(requireWs(pid).root))
}

function fuzzyScore(s: string, q: string): number {
  if (s.includes(q)) return 1000 - s.length + (s.endsWith(q) || s.split('/').pop()!.startsWith(q) ? 500 : 0)
  let i = 0, score = 0
  for (const ch of s) { if (ch === q[i]) { i++; score += 2 } if (i === q.length) return score }
  return 0
}

// ---------------- window ----------------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 560, show: false,
    // Windows: fully custom title bar. macOS: hidden title bar with the native traffic-light buttons.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } } : { frame: false }),
    backgroundColor: config.settings.theme === 'light' ? '#F4F7FF' : '#0A1233',
    title: 'PTR AI',
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('maximize', () => win?.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win?.webContents.send('window:maximized', false))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL!)) return
    e.preventDefault()
  })
  if (isDev) win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault())
})

app.whenReady().then(async () => {
  setClientUserAgent(`PTR AI/${app.getVersion()} (${process.platform}; coding-agent)`)
  const dataDir = app.getPath('userData')
  config = new ConfigStore(dataDir)
  accounts = new AccountStore(dataDir)
  nativeTheme.themeSource = config.settings.theme
  db = await Database.open(path.join(dataDir, 'ptrai.sqlite'))
  // Mark sessions that were running when the app last exited.
  for (const c of db.allConversations()) if (c.runState === 'running') db.saveConversation({ ...c, runState: 'interrupted' })
  engine = new AgentEngine({
    db,
    getWorkspace: workspaceFor,
    getProvider: providerById,
    getToolSupport: (pid, model) => toolSupportCache.get(`${pid}::${model}`) ?? config.provider(pid)?.toolSupportOverride ?? 'unknown',
    settings: () => config.settings,
    emit: (ev) => { if (win && !win.isDestroyed()) win.webContents.send('agent:event', ev) },
    getContextLength: (pid, model) => contextCache.get(`${pid}::${model}`),
    mcp: {
      tools: () => mcp.allTools(),
      call: (sid, tool, args, signal) => mcp.call(sid, tool, args, signal),
      alwaysAsk: (sid) => !!config.mcpServers().find((m) => m.id === sid)?.alwaysAsk
    },
    getAllowlist: (pid) => config.allowlist(pid),
    addToAllowlist: (pid, key) => config.addAllowlist(pid, key)
  })
  mcp = new McpManager(() => config.mcpServers(), (sid) => config.mcpSecrets(sid), app.getVersion())
  mcp.onChange = (states) => { if (win && !win.isDestroyed()) win.webContents.send('mcp:status', states) }
  updates = new UpdateService(() => ({ url: feedUrl() }))
  registerIpc()
  createWindow()
  updates.start()
  mcp.syncAll().catch((e) => console.error('MCP', e))
})

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
app.on('before-quit', () => { terminals.killAll(); mcp?.closeAll().catch(() => {}); try { db?.flush() } catch { /* ignore */ } })
app.on('window-all-closed', () => app.quit())
// macOS: clicking the Dock icon with no window open re-creates it.
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && config) createWindow() })
