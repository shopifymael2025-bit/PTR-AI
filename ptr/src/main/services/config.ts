// Local JSON configuration + encrypted credential storage (Electron safeStorage / DPAPI).
import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import { DEFAULT_SETTINGS, type McpServerConfig, type ProviderConfig, type Settings } from '../../shared/types'

interface ConfigFile {
  settings: Settings
  providers: ProviderConfig[]
  allowlists: Record<string, string[]>
  mcpServers: McpServerConfig[]
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', enabled: true },
  { id: 'openrouter', kind: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', enabled: false },
  // PTR AI's own model (beta). OpenAI-compatible endpoint; defaults to the local Ollama server until PTR AI hosts its own.
  { id: 'ptrai', kind: 'openai', name: 'PTR AI (Beta)', baseUrl: 'http://localhost:11434/v1', enabled: true },
  { id: 'opencode', kind: 'opencode', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', enabled: true },
  // OpenCode Go (paid subscription) has its own endpoint; a Go key is rejected by Zen and vice versa.
  { id: 'opencode-go', kind: 'opencode', name: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', enabled: false }
]

/** Windows shells (*.exe) make no sense on macOS/Linux and vice versa: pick the platform default. */
function platformShell(shell: string): string {
  const winShell = /\.exe$/i.test(shell)
  if (process.platform === 'win32') return winShell ? shell : 'powershell.exe'
  if (!winShell) return shell
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
}

export class ConfigStore {
  private data: ConfigFile
  private secrets: Record<string, string> = {}
  readonly encryptionAvailable: boolean

  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true })
    this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    this.data = this.load()
    this.loadSecrets()
  }

  private get file() { return path.join(this.dir, 'config.json') }
  private get secretsFile() { return path.join(this.dir, 'credentials.bin') }

  private load(): ConfigFile {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<ConfigFile>
      const s = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) } as Settings
      s.editor = { ...DEFAULT_SETTINGS.editor, ...(raw.settings?.editor ?? {}) }
      s.terminal = { ...DEFAULT_SETTINGS.terminal, ...(raw.settings?.terminal ?? {}) }
      s.terminal.shell = platformShell(s.terminal.shell)
      s.shortcuts = { ...DEFAULT_SETTINGS.shortcuts, ...(raw.settings?.shortcuts ?? {}) }
      // Keep user providers, and add built-in ones introduced by newer versions (e.g. OpenCode Zen).
      // Drop the short-lived Anthropic provider from earlier builds.
      const providers = raw.providers?.length ? raw.providers.filter((p) => (p.kind as string) !== 'anthropic') : structuredClone(DEFAULT_PROVIDERS)
      for (const d of DEFAULT_PROVIDERS) if (!providers.some((p) => p.id === d.id)) providers.push(structuredClone(d))
      return { settings: s, providers, allowlists: raw.allowlists ?? {}, mcpServers: raw.mcpServers ?? [] }
    } catch {
      const settings = structuredClone(DEFAULT_SETTINGS)
      settings.terminal.shell = platformShell(settings.terminal.shell)
      return { settings, providers: structuredClone(DEFAULT_PROVIDERS), allowlists: {}, mcpServers: [] }
    }
  }

  private save() {
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.file)
  }

  private loadSecrets() {
    if (!fs.existsSync(this.secretsFile)) return
    try {
      const buf = fs.readFileSync(this.secretsFile)
      const json = this.encryptionAvailable ? safeStorage.decryptString(buf) : buf.toString('utf8')
      this.secrets = JSON.parse(json)
    } catch { this.secrets = {} }
  }

  private saveSecrets() {
    const json = JSON.stringify(this.secrets)
    fs.writeFileSync(this.secretsFile, this.encryptionAvailable ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8'))
  }

  get settings(): Settings { return this.data.settings }
  setSettings(patch: Partial<Settings>) { this.data.settings = { ...this.data.settings, ...patch }; this.save(); return this.data.settings }

  providers(): ProviderConfig[] { return this.data.providers.map((p) => ({ ...p, hasKey: !!this.secrets[p.id] })) }
  provider(id: string) { return this.providers().find((p) => p.id === id) }
  saveProvider(p: ProviderConfig) {
    const { hasKey: _h, ...clean } = p
    const i = this.data.providers.findIndex((x) => x.id === p.id)
    if (i >= 0) this.data.providers[i] = clean; else this.data.providers.push(clean)
    this.save()
  }
  removeProvider(id: string) { this.data.providers = this.data.providers.filter((p) => p.id !== id); delete this.secrets[id]; this.save(); this.saveSecrets() }
  getKey(id: string): string | null { return this.secrets[id] ?? null }
  setKey(id: string, key: string | null) { if (key) this.secrets[id] = key; else delete this.secrets[id]; this.saveSecrets() }

  mcpServers(): McpServerConfig[] { return this.data.mcpServers.map((m) => ({ ...m, hasSecrets: !!this.secrets[`mcp:${m.id}`] })) }
  /** secrets: undefined = keep existing, null/{} = clear, object = replace. */
  saveMcpServer(s: McpServerConfig, secrets?: Record<string, string> | null) {
    const { hasSecrets: _h, ...clean } = s
    const i = this.data.mcpServers.findIndex((x) => x.id === s.id)
    if (i >= 0) this.data.mcpServers[i] = clean; else this.data.mcpServers.push(clean)
    this.save()
    if (secrets !== undefined) {
      if (secrets && Object.keys(secrets).length) this.secrets[`mcp:${s.id}`] = JSON.stringify(secrets)
      else delete this.secrets[`mcp:${s.id}`]
      this.saveSecrets()
    }
  }
  removeMcpServer(id: string) { this.data.mcpServers = this.data.mcpServers.filter((m) => m.id !== id); delete this.secrets[`mcp:${id}`]; this.save(); this.saveSecrets() }
  mcpSecrets(id: string): Record<string, string> { try { return JSON.parse(this.secrets[`mcp:${id}`] ?? '{}') } catch { return {} } }

  allowlist(projectId: string) { return this.data.allowlists[projectId] ?? [] }
  addAllowlist(projectId: string, key: string) {
    const l = new Set(this.allowlist(projectId)); l.add(key)
    this.data.allowlists[projectId] = [...l]; this.save()
  }
}

