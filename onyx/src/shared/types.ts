// Types shared between the Electron main process, preload and renderer.

export type ProviderKind = 'ollama' | 'openai' | 'openrouter' | 'opencode'
export type AgentMode = 'ask' | 'build' | 'plan'
export type ToolSupport = 'yes' | 'no' | 'unknown'
export type LayoutMode = 'chat' | 'code' | 'workspace'

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  name: string
  baseUrl: string
  enabled: boolean
  /** Extra HTTP headers (non-secret). */
  headers?: Record<string, string>
  /** Manual override when the provider cannot report tool-calling support. */
  toolSupportOverride?: ToolSupport
  /** True when an API key is stored (the key itself never leaves the main process). */
  hasKey?: boolean
}

export interface ModelInfo {
  providerId: string
  providerKind: ProviderKind
  id: string
  name: string
  local: boolean
  sizeBytes?: number
  contextLength?: number
  toolSupport: ToolSupport
  /** Only set when the provider publishes pricing (OpenRouter). */
  free?: boolean
  details?: string
}

export interface Settings {
  onboarded: boolean
  language: 'en' | 'fr'
  theme: 'dark' | 'light' | 'system'
  reduceMotion: boolean
  notifications: boolean
  startup: 'last-project' | 'home'
  defaultModel?: { providerId: string; model: string }
  defaultMode: AgentMode
  maxIterations: number
  commandTimeoutSec: number
  /**
   * auto: PTR AI acts on its own except for dangerous actions (flagged commands, deletes), which ask.
   * all: everything runs without asking, including risky actions. Paths stay restricted to the project.
   * approval: every edit, move, delete and command asks first.
   */
  permissionMode: 'auto' | 'all' | 'approval'
  contextBudgetTokens: number
  editor: { fontFamily: string; fontSize: number; tabSize: number; wordWrap: boolean; minimap: boolean; autoSave: boolean }
  terminal: { shell: string; fontSize: number; cursorStyle: 'block' | 'bar' | 'underline' }
  shortcuts: Record<string, string>
  freeModelsOnly: boolean
  /** Version of the Terms of Service the user accepted (set only by the main process via tos:accept). */
  tosAcceptedVersion?: string
  tosAcceptedAt?: number
}

/** An MCP server the user connected (Roblox Studio, filesystem, databases…). */
export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  transport: 'stdio' | 'http'
  /** stdio: program to start (.exe, .bat, npx, uvx…), %VAR%/${VAR} expanded. */
  command?: string
  args?: string[]
  /** Non-secret environment variables. Secret ones are stored encrypted, separately. */
  env?: Record<string, string>
  /** http: Streamable HTTP endpoint. */
  url?: string
  /** Ask before every tool call of this server, whatever the permission mode. */
  alwaysAsk?: boolean
  /** True when secret env vars / headers are stored for this server. */
  hasSecrets?: boolean
}
export interface McpToolInfo { name: string; description: string; inputSchema: Record<string, unknown>; readOnly: boolean; destructive: boolean }
export interface McpServerState { id: string; status: 'disabled' | 'connecting' | 'connected' | 'error'; tools: McpToolInfo[]; error?: string; serverName?: string }

export interface UpdateStatus {
  /** 'available' = newer version found but must be downloaded manually (unsigned macOS build). */
  state: 'idle' | 'unconfigured' | 'unsupported' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  error?: string
  checkedAt?: number
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  language: 'en',
  theme: 'dark',
  reduceMotion: false,
  notifications: true,
  startup: 'last-project',
  defaultMode: 'build',
  maxIterations: 25,
  commandTimeoutSec: 120,
  permissionMode: 'auto',
  contextBudgetTokens: 24000,
  editor: { fontFamily: 'JetBrains Mono', fontSize: 13, tabSize: 2, wordWrap: false, minimap: false, autoSave: false },
  terminal: { shell: 'powershell.exe', fontSize: 13, cursorStyle: 'bar' },
  shortcuts: {
    focusChat: 'Ctrl+L',
    openProject: 'Ctrl+O',
    newSession: 'Ctrl+N',
    quickOpen: 'Ctrl+P',
    commandPalette: 'Ctrl+Shift+P',
    toggleSidebar: 'Ctrl+B'
  },
  freeModelsOnly: true
}

export interface Project {
  id: string
  name: string
  path: string
  lastOpened: number
  modelPref?: { providerId: string; model: string }
  layout?: { mode: LayoutMode; sizes: Record<string, number>; collapsed: Record<string, boolean> }
  isGit?: boolean
}

export interface Conversation {
  id: string
  projectId: string | null
  title: string
  createdAt: number
  updatedAt: number
  mode: AgentMode
  providerId?: string
  model?: string
  pinned?: boolean
  /** 'running' is persisted while an agent loop runs, so a crash/restart is detectable. */
  runState?: 'idle' | 'running' | 'interrupted'
  plan?: PlanState
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResultMeta {
  ok: boolean
  denied?: boolean
  durationMs?: number
  changeIds?: string[]
}

export interface ChatMessage {
  id: string
  convId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  createdAt: number
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
  toolMeta?: ToolResultMeta
  reasoning?: string
  model?: string
  usage?: { promptTokens?: number; completionTokens?: number }
  error?: string
  attachments?: string[]
  runId?: string
}

export interface PlanStep { title: string; detail?: string; status: 'pending' | 'in_progress' | 'done' | 'skipped' }
export interface PlanState { summary: string; steps: PlanStep[]; approved: boolean }

export interface FileChange {
  id: string
  runId: string
  convId: string
  projectId: string
  path: string // relative to project root
  before: string | null // null = file did not exist
  after: string | null // null = file deleted
  status: 'applied' | 'reverted'
  createdAt: number
}

export interface ApprovalRequest {
  id: string
  runId: string
  convId: string
  kind: 'command' | 'edit' | 'delete' | 'move' | 'git' | 'mcp'
  title: string
  command?: string
  cwd?: string
  danger?: string
  path?: string
  before?: string | null
  after?: string | null
  /** Allow-list key offered for "always allow" (commands only, never for dangerous ones). */
  allowKey?: string
}

export type ApprovalDecision = 'allow' | 'deny' | 'always'

export type AgentEvent =
  | { type: 'run_start'; runId: string; convId: string }
  | { type: 'delta'; runId: string; convId: string; text: string }
  | { type: 'reasoning'; runId: string; convId: string; text: string }
  | { type: 'message'; runId: string; convId: string; message: ChatMessage }
  | { type: 'tool_output'; runId: string; convId: string; callId: string; chunk: string }
  | { type: 'approval'; runId: string; convId: string; request: ApprovalRequest }
  | { type: 'approval_resolved'; runId: string; convId: string; requestId: string }
  | { type: 'plan'; runId: string; convId: string; plan: PlanState }
  | { type: 'status'; runId: string; convId: string; text: string }
  | { type: 'run_end'; runId: string; convId: string; status: 'done' | 'cancelled' | 'error' | 'limit' | 'awaiting_plan'; error?: string }

export interface DirEntry { name: string; path: string; isDir: boolean; size?: number }

export interface GitStatus {
  available: boolean
  isRepo: boolean
  branch?: string
  files: { path: string; index: string; worktree: string }[]
  error?: string
}

export interface OllamaStatus { running: boolean; version?: string; error?: string }
export interface PullProgress { model: string; status: string; total?: number; completed?: number; done?: boolean; error?: string }
