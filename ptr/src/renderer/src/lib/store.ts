import { create } from 'zustand'
import type { AgentEvent, AgentMode, ApprovalRequest, ChatMessage, Conversation, LayoutMode, AuthStatus, ModelInfo, OllamaStatus, PlanState, Project, ProviderConfig, Settings } from '@shared/types'
import { invoke, on } from './api'
import { translate } from './i18n'
const tr = (k: string) => translate(useStore.getState().settings?.language ?? 'en', k)

export interface OpenFile { path: string; content: string; saved: string; mtime?: number; binary?: boolean }
export interface LiveRun { running: boolean; text: string; reasoning: string; toolOutput: Record<string, string>; approvals: ApprovalRequest[]; status?: string; lastEnd?: 'done' | 'cancelled' | 'error' | 'limit' | 'awaiting_plan' }
export interface Toast { id: number; kind: 'info' | 'error'; text: string }
type ProjectX = Project & { missing?: boolean }

interface State {
  ready: boolean
  auth: AuthStatus | null
  settings: Settings | null
  providers: ProviderConfig[]
  models: ModelInfo[]
  modelErrors: { providerId: string; message: string }[]
  modelsLoading: boolean
  ollama: OllamaStatus | null
  projects: ProjectX[]
  projectId: string | null
  conversations: (Conversation & { running?: boolean })[]
  convId: string | null
  tabs: string[]
  messages: Record<string, ChatMessage[]>
  live: Record<string, LiveRun>
  plans: Record<string, PlanState | undefined>
  selected: { providerId: string; model: string } | null
  mode: AgentMode
  layout: LayoutMode
  sidebarOpen: boolean
  files: OpenFile[]
  activeFile: string | null
  diff: { path: string; before: string; after: string } | null
  rightPanel: 'changes' | 'git' | null
  modal: null | 'settings' | 'palette' | 'quickOpen' | 'onboarding' | 'projectPicker'
  settingsSection: string
  toasts: Toast[]
  fsVersion: number
  /** Commands queued to be typed into the integrated terminal. */
  termQueue: { id: number; cmd: string }[]
  /** In-app text prompt (Electron does not implement window.prompt). */
  promptState: { title: string; value: string } | null
  /** In-app confirmation dialog (replaces the native window.confirm popup). */
  confirmState: { message: string; danger: boolean; okLabel?: string } | null
}
let confirmResolve: ((ok: boolean) => void) | null = null
/** Shows PTR AI's own confirmation dialog. Resolves true on confirm, false on cancel. */
export function confirmDialog(message: string, opts: { danger?: boolean; okLabel?: string } = {}): Promise<boolean> {
  confirmResolve?.(false)
  return new Promise((resolve) => { confirmResolve = resolve; useStore.setState({ confirmState: { message, danger: opts.danger ?? true, okLabel: opts.okLabel } }) })
}
export function resolveConfirm(ok: boolean) {
  useStore.setState({ confirmState: null })
  confirmResolve?.(ok)
  confirmResolve = null
}
let promptResolve: ((v: string | null) => void) | null = null
/** Asks the user for a line of text in an in-app dialog. */
export function askText(title: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => { promptResolve = resolve; useStore.setState({ promptState: { title, value } }) })
}
export function resolveAskText(v: string | null) {
  useStore.setState({ promptState: null })
  promptResolve?.(v)
  promptResolve = null
}
let pickerResolve: ((projectId: string | null) => void) | null = null
let termSeq = 0

export const useStore = create<State>(() => ({
  ready: false, auth: null, settings: null, providers: [], models: [], modelErrors: [], modelsLoading: false, ollama: null,
  projects: [], projectId: null, conversations: [], convId: null, tabs: [], messages: {}, live: {}, plans: {},
  selected: null, mode: 'build', layout: 'chat', sidebarOpen: true, files: [], activeFile: null, diff: null, rightPanel: null,
  modal: null, settingsSection: 'general', toasts: [], fsVersion: 0, termQueue: [], promptState: null, confirmState: null
}))
const set = useStore.setState
const get = useStore.getState

let toastSeq = 0
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++toastSeq, kind, text }
  set((s) => ({ toasts: [...s.toasts, t] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'error' ? 8000 : 3500)
}
export async function safe<T>(p: Promise<T>): Promise<T | undefined> {
  try { return await p } catch (e) { toast((e as Error).message, 'error'); return undefined }
}

const emptyLive = (): LiveRun => ({ running: false, text: '', reasoning: '', toolOutput: {}, approvals: [] })
const patchLive = (convId: string, fn: (l: LiveRun) => Partial<LiveRun>) =>
  set((s) => { const cur = s.live[convId] ?? emptyLive(); return { live: { ...s.live, [convId]: { ...cur, ...fn(cur) } } } })

// ---------------- actions ----------------
export const actions = {
  async logout() {
    const auth = await safe(invoke<AuthStatus>('auth:logout'))
    if (auth) set({ auth, modal: null })
  },
  async init() {
    const settings = await invoke<Settings>('settings:get')
    const auth = await invoke<AuthStatus>('auth:status')
    set({ auth })
    const providers = await invoke<ProviderConfig[]>('providers:list')
    const projects = await invoke<ProjectX[]>('projects:list')
    set({ settings, providers, projects, mode: settings.defaultMode, selected: settings.defaultModel ?? null, modal: settings.onboarded ? null : 'onboarding' })
    applyTheme(settings)
    on<AgentEvent>('agent:event', handleAgentEvent)
    on<boolean>('window:maximized', () => {})
    if (settings.startup === 'last-project' && projects[0] && !projects[0].missing) await actions.openProject(projects[0].id, true)
    else await actions.loadConversations()
    set({ ready: true })
    actions.refreshModels()
    actions.refreshOllama()
  },

  async refreshOllama() { set({ ollama: await invoke<OllamaStatus>('ollama:status').catch(() => ({ running: false })) }) },

  async refreshModels() {
    set({ modelsLoading: true })
    try {
      const r = await invoke<{ models: ModelInfo[]; errors: { providerId: string; message: string }[] }>('models:list')
      set({ models: r.models, modelErrors: r.errors })
      const sel = get().selected
      if ((!sel || !r.models.some((m) => m.providerId === sel.providerId && m.id === sel.model)) && r.models.length) {
        const first = r.models.find((m) => m.local) ?? r.models.find((m) => m.free) ?? r.models[0]
        if (!sel) actions.selectModel(first.providerId, first.id)
      }
    } finally { set({ modelsLoading: false }) }
  },

  selectModel(providerId: string, model: string) {
    set({ selected: { providerId, model } })
    const pid = get().projectId
    if (pid) invoke('projects:update', { id: pid, modelPref: { providerId, model } }).catch(() => {})
    actions.updateSettings({ defaultModel: { providerId, model } })
  },

  async updateSettings(patch: Partial<Settings>) {
    const s = await invoke<Settings>('settings:set', patch)
    set({ settings: s }); applyTheme(s)
  },

  async refreshProjects() { set({ projects: await invoke<ProjectX[]>('projects:list') }) },

  async openProjectDialog(create = false) {
    const p = await safe(invoke<Project | null>(create ? 'projects:createDialog' : 'projects:openDialog'))
    if (p) await actions.openProject(p.id)
  },

  async openProject(id: string | null, silent = false) {
    if (id) {
      const p = await (silent ? invoke<Project>('projects:open', id).catch(() => null) : safe(invoke<Project>('projects:open', id)))
      if (!p) return
      set({ projectId: p.id, files: [], activeFile: null, diff: null, tabs: [], convId: null, layout: p.layout?.mode ?? get().layout })
      if (p.modelPref) set({ selected: p.modelPref })
    } else set({ projectId: null, files: [], activeFile: null, tabs: [], convId: null })
    await actions.refreshProjects()
    await actions.loadConversations()
    const first = get().conversations[0]
    if (first) await actions.openConversation(first.id)
  },

  async loadConversations() {
    set({ conversations: await invoke<Conversation[]>('conv:list', { projectId: get().projectId }) })
  },

  async newConversation() {
    const c = await invoke<Conversation>('conv:create', { projectId: get().projectId, mode: get().mode })
    await actions.loadConversations()
    await actions.openConversation(c.id)
    return c
  },

  async openConversation(id: string) {
    const r = await invoke<{ conversation: Conversation; messages: ChatMessage[]; approvals: ApprovalRequest[]; running: boolean }>('conv:messages', id)
    set((s) => ({
      convId: id,
      tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id].slice(-8),
      messages: { ...s.messages, [id]: r.messages },
      plans: { ...s.plans, [id]: r.conversation?.plan },
      mode: r.conversation?.mode ?? s.mode
    }))
    patchLive(id, (l) => ({ running: r.running, approvals: r.approvals, text: r.running ? l.text : '' }))
  },

  closeTab(id: string) {
    set((s) => {
      const tabs = s.tabs.filter((t) => t !== id)
      return { tabs, convId: s.convId === id ? tabs[tabs.length - 1] ?? null : s.convId }
    })
    const c = get().convId
    if (c) actions.openConversation(c)
  },

  async send(text: string, attachments: string[] = []) {
    const sel = get().selected
    if (!sel) { toast('Select a model first', 'error'); return }
    let convId = get().convId
    if (!convId) convId = (await actions.newConversation()).id
    patchLive(convId, () => ({ running: true, text: '', reasoning: '', status: undefined }))
    await safe(invoke('agent:send', { convId, text, attachments, mode: get().mode, providerId: sel.providerId, model: sel.model }).catch((e) => { patchLive(convId!, () => ({ running: false })); throw e }))
  },

  async stop() { const c = get().convId; if (c) await invoke('agent:cancel', c) },

  async editAndResend(messageId: string, text: string) {
    const convId = get().convId!
    const msgs = await safe(invoke<ChatMessage[]>('conv:truncateFrom', { convId, messageId }))
    if (!msgs) return
    set((s) => ({ messages: { ...s.messages, [convId]: msgs } }))
    const orig = get().messages[convId]
    void orig
    await actions.send(text)
  },

  async regenerate() {
    const convId = get().convId!
    const msgs = get().messages[convId] ?? []
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    await actions.editAndResend(lastUser.id, lastUser.content)
  },

  async approve(req: ApprovalRequest, decision: 'allow' | 'deny' | 'always') {
    await invoke('agent:approve', { requestId: req.id, decision })
    patchLive(req.convId, (l) => ({ approvals: l.approvals.filter((a) => a.id !== req.id) }))
  },

  async approvePlan() {
    const convId = get().convId; const sel = get().selected
    if (!convId || !sel) return
    set({ mode: 'build' })
    patchLive(convId, () => ({ running: true, text: '' }))
    await safe(invoke('agent:approvePlan', { convId, providerId: sel.providerId, model: sel.model }))
  },

  setMode(mode: AgentMode) {
    set({ mode })
    const c = get().convId
    if (c) invoke('conv:update', { id: c, mode }).catch(() => {})
  },

  setLayout(layout: LayoutMode) {
    set({ layout })
    const pid = get().projectId
    const p = get().projects.find((x) => x.id === pid)
    if (pid) invoke('projects:update', { id: pid, layout: { ...(p?.layout ?? { sizes: {}, collapsed: {} }), mode: layout } }).catch(() => {})
  },

  savePanelSize(key: string, size: number) {
    const pid = get().projectId
    const projects = get().projects
    const p = projects.find((x) => x.id === pid)
    if (!p) return
    const layout = { mode: get().layout, collapsed: p.layout?.collapsed ?? {}, sizes: { ...(p.layout?.sizes ?? {}), [key]: size } }
    set({ projects: projects.map((x) => (x.id === pid ? { ...x, layout } : x)) })
    invoke('projects:update', { id: pid, layout }).catch(() => {})
  },

  // ---------- editor ----------
  async openFile(path: string) {
    const pid = get().projectId
    if (!pid) return
    if (!get().files.some((f) => f.path === path)) {
      const r = await safe(invoke<{ content: string; binary: boolean; mtime: number; truncated: boolean }>('fs:read', { projectId: pid, path }))
      if (!r) return
      if (r.truncated) toast('File is larger than 512 KB; only the beginning is shown and saving is disabled.', 'error')
      set((s) => ({ files: [...s.files, { path, content: r.content, saved: r.truncated ? '\u0000' : r.content, mtime: r.mtime, binary: r.binary || r.truncated }] }))
    }
    set({ activeFile: path, diff: null })
    if (get().layout === 'chat') actions.setLayout('code')
  },

  async reloadFile(path: string) {
    const pid = get().projectId
    if (!pid) return
    const r = await invoke<{ content: string; mtime: number }>('fs:read', { projectId: pid, path }).catch(() => null)
    if (!r) { set((s) => ({ files: s.files.filter((f) => f.path !== path) })); return }
    set((s) => ({ files: s.files.map((f) => (f.path === path && f.content === f.saved ? { ...f, content: r.content, saved: r.content, mtime: r.mtime } : f)) }))
  },

  updateFile(path: string, content: string) { set((s) => ({ files: s.files.map((f) => (f.path === path ? { ...f, content } : f)) })) },

  async saveFile(path: string, force = false): Promise<void> {
    const pid = get().projectId
    const f = get().files.find((x) => x.path === path)
    if (!pid || !f || f.binary) return
    try {
      const r = await invoke<{ mtime: number }>('fs:write', { projectId: pid, path, content: f.content, expectedMtime: force ? undefined : f.mtime })
      set((s) => ({ files: s.files.map((x) => (x.path === path ? { ...x, saved: f.content, mtime: r.mtime } : x)) }))
    } catch (e) {
      const msg = (e as Error).message
      if (msg.startsWith('CONFLICT') && await confirmDialog(`${tr('This file changed on disk since you opened it. Overwrite it with your version?')}\n\n${path}`, { okLabel: tr('Overwrite') })) return actions.saveFile(path, true)
      toast(msg, 'error')
    }
  },

  async closeFile(path: string) {
    const f = get().files.find((x) => x.path === path)
    if (f && f.content !== f.saved && !(await confirmDialog(`${tr('Discard unsaved changes?')}\n\n${path}`, { okLabel: tr('Discard') }))) return
    set((s) => {
      const files = s.files.filter((x) => x.path !== path)
      return { files, activeFile: s.activeFile === path ? files[files.length - 1]?.path ?? null : s.activeFile }
    })
  },

  /** Types a command into the integrated terminal (opening the Workspace layout if needed). */
  runInTerminal(cmd: string) {
    if (get().layout !== 'workspace') actions.setLayout('workspace')
    set((s) => ({ termQueue: [...s.termQueue, { id: ++termSeq, cmd }] }))
  },

  /**
   * Makes sure the current conversation belongs to a project. If not, asks the user to pick a
   * project already known to PTR AI or open a new folder, then moves the conversation there.
   */
  async ensureProject(): Promise<string | null> {
    const current = get().projectId
    if (current) return current
    const pid = await new Promise<string | null>((resolve) => { pickerResolve = resolve; set({ modal: 'projectPicker' }) })
    if (!pid) return null
    const convId = get().convId
    if (convId) await safe(invoke('conv:moveToProject', { convId, projectId: pid }))
    await actions.openProject(pid, true)
    if (convId) await actions.openConversation(convId)
    return get().projectId
  },
  resolveProjectPicker(projectId: string | null) {
    set({ modal: null })
    pickerResolve?.(projectId)
    pickerResolve = null
  },

  showDiff(path: string, before: string, after: string) {
    set({ diff: { path, before, after } })
    if (get().layout === 'chat') actions.setLayout('code')
  }
}

function handleAgentEvent(ev: AgentEvent) {
  const c = ev.convId
  switch (ev.type) {
    case 'run_start': patchLive(c, () => ({ running: true, text: '', reasoning: '', status: undefined, lastEnd: undefined })); break
    case 'delta': patchLive(c, (l) => ({ text: l.text + ev.text })); break
    case 'reasoning': patchLive(c, (l) => ({ reasoning: l.reasoning + ev.text })); break
    case 'message':
      set((s) => ({ messages: { ...s.messages, [c]: [...(s.messages[c] ?? []).filter((m) => m.id !== ev.message.id), ev.message] } }))
      if (ev.message.role === 'assistant') patchLive(c, () => ({ text: '', reasoning: '' }))
      if (ev.message.role === 'tool' && ev.message.toolMeta?.changeIds?.length) {
        set((s) => ({ fsVersion: s.fsVersion + 1 }))
        for (const f of get().files) actions.reloadFile(f.path)
      }
      break
    case 'tool_output': patchLive(c, (l) => ({ toolOutput: { ...l.toolOutput, [ev.callId]: ((l.toolOutput[ev.callId] ?? '') + ev.chunk).slice(-20000) } })); break
    case 'approval':
      patchLive(c, (l) => ({ approvals: [...l.approvals, ev.request] }))
      if (get().settings?.notifications && !document.hasFocus()) new Notification('PTR AI — approval needed', { body: ev.request.title })
      break
    case 'approval_resolved': patchLive(c, (l) => ({ approvals: l.approvals.filter((a) => a.id !== ev.requestId) })); break
    case 'plan': set((s) => ({ plans: { ...s.plans, [c]: ev.plan } })); break
    case 'status': patchLive(c, () => ({ status: ev.text })); break
    case 'run_end':
      patchLive(c, () => ({ running: false, text: '', reasoning: '', approvals: [], lastEnd: ev.status }))
      actions.loadConversations()
      if (get().settings?.notifications && !document.hasFocus() && ev.status !== 'cancelled') new Notification('PTR AI', { body: ev.status === 'error' ? `Task failed: ${ev.error ?? ''}` : 'Task finished' })
      break
  }
}

export function applyTheme(s: Settings) {
  const dark = s.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : s.theme === 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.motion = s.reduceMotion ? 'reduce' : 'full'
}

export function useLive(convId: string | null): LiveRun {
  return useStore((s) => (convId ? s.live[convId] : undefined)) ?? EMPTY_LIVE
}
const EMPTY_LIVE = emptyLive()
