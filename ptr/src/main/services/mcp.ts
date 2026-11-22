// MCP (Model Context Protocol) client manager.
// Connects to the MCP servers the user configured (local programs over stdio, or remote servers
// over Streamable HTTP), lists their tools, and calls them on behalf of the agent.
// Every call still goes through the agent's permission checks (see engine.ts).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig, McpServerState, McpToolInfo } from '../../shared/types'

const CALL_TIMEOUT_MS = 120_000
const CONNECT_TIMEOUT_MS = 30_000

interface Conn { client: Client; tools: McpToolInfo[]; transport: { close(): Promise<void> } }

/** Tool names exposed to the model: mcp__<server>__<tool>, limited to [A-Za-z0-9_-]{1,64}. */
export function mcpToolName(serverId: string, tool: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_')
  return `mcp__${clean(serverId)}__${clean(tool)}`.slice(0, 64)
}

export class McpManager {
  private conns = new Map<string, Conn>()
  private states = new Map<string, McpServerState>()
  private connecting = new Map<string, Promise<void>>()
  onChange: (states: McpServerState[]) => void = () => {}

  constructor(private getServers: () => McpServerConfig[], private getSecretEnv: (id: string) => Record<string, string>, private clientVersion: string) {}

  list(): McpServerState[] {
    return this.getServers().map((s) => this.states.get(s.id) ?? { id: s.id, status: s.enabled ? 'connecting' : 'disabled', tools: [] })
  }

  private setState(st: McpServerState) { this.states.set(st.id, st); this.onChange(this.list()) }

  /** (Re)connects every enabled server and disconnects removed/disabled ones. */
  async syncAll() {
    const servers = this.getServers()
    for (const id of [...this.conns.keys()]) if (!servers.some((s) => s.id === id && s.enabled)) await this.disconnect(id)
    for (const id of [...this.states.keys()]) if (!servers.some((s) => s.id === id)) this.states.delete(id)
    await Promise.all(servers.map((s) => (s.enabled ? this.connect(s.id) : (this.setState({ id: s.id, status: 'disabled', tools: [] }), Promise.resolve()))))
  }

  async restart(id: string) { await this.disconnect(id); await this.connect(id) }

  async disconnect(id: string) {
    const c = this.conns.get(id)
    this.conns.delete(id)
    if (c) await c.transport.close().catch(() => {})
  }

  connect(id: string): Promise<void> {
    if (this.conns.has(id)) return Promise.resolve()
    const pending = this.connecting.get(id)
    if (pending) return pending
    const p = this.doConnect(id).finally(() => this.connecting.delete(id))
    this.connecting.set(id, p)
    return p
  }

  private async doConnect(id: string) {
    const cfg = this.getServers().find((s) => s.id === id)
    if (!cfg || !cfg.enabled) return
    this.setState({ id, status: 'connecting', tools: [] })
    let transport: StdioClientTransport | StreamableHTTPClientTransport
    let stderr = ''
    try {
      if (cfg.transport === 'http') {
        if (!cfg.url) throw new Error('Missing URL')
        const headers = this.getSecretEnv(id)
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers } })
      } else {
        if (!cfg.command) throw new Error('Missing command')
        const { command, args } = resolveCommand(cfg.command, cfg.args ?? [])
        transport = new StdioClientTransport({
          command, args, cwd: os.homedir(), stderr: 'pipe',
          env: { ...getDefaultEnvironment(), ...expandEnv(cfg.env ?? {}), ...this.getSecretEnv(id) }
        })
        transport.stderr?.on('data', (b: Buffer) => { stderr = (stderr + b.toString()).slice(-2000) })
      }
      const client = new Client({ name: 'ptr-ai', version: this.clientVersion })
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'Connection timed out')
      const res = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, 'Listing tools timed out')
      const tools: McpToolInfo[] = res.tools.map((t) => ({
        name: t.name, description: t.description ?? '', inputSchema: (t.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
        readOnly: t.annotations?.readOnlyHint === true, destructive: t.annotations?.destructiveHint === true
      }))
      transport.onclose = () => { if (this.conns.get(id)?.client === client) { this.conns.delete(id); this.setState({ id, status: 'error', tools: [], error: 'The server stopped. Press restart.' }) } }
      this.conns.set(id, { client, tools, transport })
      this.setState({ id, status: 'connected', tools, serverName: client.getServerVersion()?.name })
    } catch (e) {
      const msg = (e as Error).message + (stderr.trim() ? `\n${stderr.trim().split('\n').slice(-6).join('\n')}` : '')
      this.setState({ id, status: 'error', tools: [], error: msg.slice(0, 1500) })
    }
  }

  /** All tools of connected servers, with the public names given to the model. */
  allTools(): { serverId: string; serverName: string; publicName: string; tool: McpToolInfo }[] {
    const out: { serverId: string; serverName: string; publicName: string; tool: McpToolInfo }[] = []
    for (const s of this.getServers()) {
      const c = this.conns.get(s.id)
      if (!c) continue
      for (const t of c.tools) out.push({ serverId: s.id, serverName: s.name, publicName: mcpToolName(s.id, t.name), tool: t })
    }
    return out
  }

  async call(serverId: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: boolean; text: string }> {
    if (!this.conns.has(serverId)) await this.connect(serverId)
    const c = this.conns.get(serverId)
    if (!c) throw new Error(`MCP server "${serverId}" is not connected: ${this.states.get(serverId)?.error ?? 'unknown error'}`)
    const res = await c.client.callTool({ name: tool, arguments: args }, undefined, { signal, timeout: CALL_TIMEOUT_MS })
    const parts: string[] = []
    for (const item of (res.content as { type: string; text?: string; mimeType?: string; resource?: { uri?: string; text?: string } }[]) ?? []) {
      if (item.type === 'text') parts.push(item.text ?? '')
      else if (item.type === 'image') parts.push(`[image ${item.mimeType ?? ''} returned by the tool]`)
      else if (item.type === 'resource') parts.push(item.resource?.text ?? `[resource ${item.resource?.uri ?? ''}]`)
      else parts.push(`[${item.type}]`)
    }
    if (res.structuredContent && !parts.length) parts.push(JSON.stringify(res.structuredContent, null, 1))
    return { ok: !res.isError, text: parts.join('\n') || '(no output)' }
  }

  async closeAll() { for (const id of [...this.conns.keys()]) await this.disconnect(id) }
}

/**
 * Expands %VAR% / ${VAR} / ~ in the command and its arguments.
 * The MCP SDK starts processes with cross-spawn, which already runs .bat/.cmd files through
 * cmd.exe with correct quoting, so they are passed as-is (wrapping them again breaks paths).
 */
export function resolveCommand(command: string, args: string[]): { command: string; args: string[] } {
  return { command: expandVars(command.trim().replace(/^"|"$/g, '')), args: args.map(expandVars) }
}

function expandVars(s: string): string {
  return s
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, k) => process.env[k] ?? m)
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => process.env[k] ?? m)
    .replace(/^~(?=$|[\\/])/, os.homedir())
}
function expandEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, expandVars(v)]))
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Known MCP servers PTR AI can detect on this computer. */
export function detectPresets(): { name: string; transport: 'stdio'; command: string; args: string[]; found: boolean; note: string }[] {
  const out: { name: string; transport: 'stdio'; command: string; args: string[]; found: boolean; note: string }[] = []
  if (process.platform === 'win32') {
    const bat = path.join(process.env.LOCALAPPDATA ?? '', 'Roblox', 'mcp.bat')
    out.push({ name: 'Roblox Studio', transport: 'stdio', command: '%LOCALAPPDATA%\\Roblox\\mcp.bat', args: [], found: fs.existsSync(bat), note: 'Official Roblox Studio MCP server (StudioMCP). Open Roblox Studio with a place for the tools to act on it.' })
  } else if (process.platform === 'darwin') {
    const candidates = [
      path.join(os.homedir(), 'Library', 'Application Support', 'Roblox', 'mcp.sh'),
      '/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP'
    ]
    const hit = candidates.find((c) => fs.existsSync(c))
    out.push({ name: 'Roblox Studio', transport: 'stdio', command: hit ?? candidates[1], args: [], found: !!hit, note: 'Official Roblox Studio MCP server (StudioMCP). Open Roblox Studio with a place for the tools to act on it.' })
  }
  return out
}

/** Reads MCP servers from Claude Desktop / Claude Code configs, if present (names, commands, args, URLs). */
export function importFromClaude(): { name: string; transport: 'stdio' | 'http'; command?: string; args?: string[]; url?: string; env?: Record<string, string> }[] {
  const files = [
    process.platform === 'win32' ? path.join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json') : path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    path.join(os.homedir(), '.claude.json')
  ]
  const found = new Map<string, { name: string; transport: 'stdio' | 'http'; command?: string; args?: string[]; url?: string; env?: Record<string, string> }>()
  const visit = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    const rec = o as Record<string, unknown>
    const servers = rec.mcpServers as Record<string, { command?: string; args?: string[]; url?: string; type?: string; env?: Record<string, string> }> | undefined
    if (servers && typeof servers === 'object') {
      for (const [name, v] of Object.entries(servers)) {
        if (!v || found.has(name)) continue
        if (v.url) found.set(name, { name, transport: 'http', url: v.url })
        else if (v.command) found.set(name, { name, transport: 'stdio', command: v.command, args: Array.isArray(v.args) ? v.args : [], env: v.env })
      }
    }
    for (const [k, v] of Object.entries(rec)) if (k !== 'mcpServers') visit(v)
  }
  for (const f of files) {
    try { if (fs.existsSync(f)) visit(JSON.parse(fs.readFileSync(f, 'utf8'))) } catch { /* unreadable config: skip */ }
  }
  return [...found.values()]
}
