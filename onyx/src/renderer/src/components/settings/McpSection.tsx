import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2, ChevronRight, Download, Pencil, Plug, CircleCheck, CircleAlert, Loader2, CircleOff } from 'lucide-react'
import type { McpServerConfig, McpServerState } from '@shared/types'
import { safe, toast, confirmDialog } from '../../lib/store'
import { invoke, on } from '../../lib/api'
import { useT } from '../../lib/i18n'

type Listing = { servers: McpServerConfig[]; states: McpServerState[] }
type Preset = { name: string; transport: 'stdio'; command: string; args: string[]; found: boolean; note: string }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `mcp-${Date.now().toString(36)}`
const parseKV = (text: string) => Object.fromEntries(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

export function McpSection() {
  const t = useT()
  const [data, setData] = useState<Listing>({ servers: [], states: [] })
  const [presets, setPresets] = useState<Preset[]>([])
  const [editing, setEditing] = useState<McpServerConfig | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    invoke<Listing>('mcp:list').then(setData)
    invoke<Preset[]>('mcp:detect').then(setPresets)
    return on<McpServerState[]>('mcp:status', (states) => setData((d) => ({ ...d, states })))
  }, [])

  const save = async (server: McpServerConfig, secrets?: Record<string, string> | null) => {
    const r = await safe(invoke<Listing>('mcp:save', { server, secrets }))
    if (r) { setData(r); setEditing(null) }
  }
  const addPreset = (p: Preset) => save({ id: slug(p.name), name: p.name, enabled: true, transport: p.transport, command: p.command, args: p.args })
  const importClaude = async () => {
    const r = await safe(invoke<Listing & { added: number }>('mcp:importClaude'))
    if (r) { setData(r); toast(r.added ? `${r.added} ${t('MCP server(s) imported')}` : t('No new MCP server found in Claude')) }
  }

  const state = (id: string) => data.states.find((s) => s.id === id)
  const missingPresets = presets.filter((p) => !data.servers.some((s) => s.name.toLowerCase() === p.name.toLowerCase()))

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-fg2 leading-relaxed">{t('MCP lets PTR AI use the tools of other applications (Roblox Studio, databases, browsers, design tools…). Each server runs on your computer or at an address you trust. Tool calls follow your permission mode; destructive tools ask first in Auto mode.')}</p>

      {missingPresets.map((p) => (
        <div key={p.name} className="card px-4 py-3 flex items-center gap-3">
          <Plug size={16} className="text-fg2 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium">{p.name} {p.found ? <span className="text-2xs text-add ml-1">{t('detected on this computer')}</span> : <span className="text-2xs text-fg3 ml-1">{t('not found')}</span>}</div>
            <div className="text-[12px] text-fg3">{t(p.note)}</div>
          </div>
          <button className="btn-primary h-8" onClick={() => addPreset(p)}><Plus size={13} />{t('Add')}</button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <div className="label">{t('Servers')}</div>
        <div className="ml-auto flex gap-1.5">
          <button className="btn h-7" onClick={importClaude} title={t('Copies the MCP servers configured in Claude Desktop / Claude Code on this computer')}><Download size={13} />{t('Import from Claude')}</button>
          <button className="btn h-7" onClick={() => setEditing({ id: '', name: '', enabled: true, transport: 'stdio', command: '', args: [] })}><Plus size={13} />{t('Add server')}</button>
        </div>
      </div>

      {editing && <McpForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />}

      {!data.servers.length && !editing && <div className="text-[13px] text-fg3">{t('No MCP server yet.')}</div>}

      {data.servers.map((s) => {
        const st = state(s.id)
        const Icon = !s.enabled ? CircleOff : st?.status === 'connected' ? CircleCheck : st?.status === 'error' ? CircleAlert : Loader2
        return (
          <div key={s.id} className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3">
              <Icon size={15} className={`shrink-0 ${!s.enabled ? 'text-fg3' : st?.status === 'connected' ? 'text-add' : st?.status === 'error' ? 'text-del' : 'text-fg3 animate-spin'}`} />
              <button className="flex-1 min-w-0 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <div className="text-[13.5px] font-medium flex items-center gap-1.5">{s.name}<ChevronRight size={12} className={`text-fg3 ${open === s.id ? 'rotate-90' : ''}`} /></div>
                <div className="text-2xs text-fg3 mono truncate">
                  {s.transport === 'http' ? s.url : [s.command, ...(s.args ?? [])].join(' ')}
                  {st?.status === 'connected' && ` · ${st.tools.length} ${t('tools')}`}
                </div>
              </button>
              <label className="flex items-center gap-1.5 text-[12px] text-fg2" title={t('Ask before every tool call of this server')}><input type="checkbox" checked={!!s.alwaysAsk} onChange={(e) => save({ ...s, alwaysAsk: e.target.checked })} />{t('Always ask')}</label>
              <label className="flex items-center gap-1.5 text-[12px] text-fg2"><input type="checkbox" checked={s.enabled} onChange={(e) => save({ ...s, enabled: e.target.checked })} />{t('Enabled')}</label>
              <button className="icon-btn" title={t('Restart')} aria-label={t('Restart')} onClick={async () => { const r = await safe(invoke<Listing>('mcp:restart', s.id)); if (r) setData(r) }}><RefreshCw size={13} /></button>
              <button className="icon-btn" title={t('Edit')} aria-label={t('Edit')} onClick={() => setEditing(s)}><Pencil size={13} /></button>
              <button className="icon-btn hover:text-del" aria-label={t('delete')} onClick={async () => { if (await confirmDialog(`${t('Remove this MCP server?')} — ${s.name}`, { okLabel: t('remove') })) { const r = await safe(invoke<Listing>('mcp:remove', s.id)); if (r) setData(r) } }}><Trash2 size={13} /></button>
            </div>
            {st?.status === 'error' && <pre className="px-4 pb-3 text-[11.5px] mono text-del whitespace-pre-wrap selectable">{st.error}</pre>}
            {open === s.id && st?.status === 'connected' && (
              <div className="border-t border-line max-h-72 overflow-y-auto">
                {st.tools.map((tool) => (
                  <div key={tool.name} className="px-4 py-2 border-b border-line/60 last:border-0">
                    <div className="text-[12.5px] mono flex items-center gap-2">{tool.name}
                      {tool.readOnly && <span className="text-2xs text-fg3 font-sans">{t('read-only')}</span>}
                      {tool.destructive && <span className="text-2xs text-warn font-sans">{t('can modify')}</span>}
                    </div>
                    <div className="text-2xs text-fg3 line-clamp-2">{tool.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function McpForm({ initial, onCancel, onSave }: { initial: McpServerConfig; onCancel: () => void; onSave: (s: McpServerConfig, secrets?: Record<string, string> | null) => void }) {
  const t = useT()
  const [name, setName] = useState(initial.name)
  const [transport, setTransport] = useState(initial.transport)
  const [command, setCommand] = useState(initial.command ?? '')
  const [args, setArgs] = useState((initial.args ?? []).join('\n'))
  const [env, setEnv] = useState(Object.entries(initial.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'))
  const [url, setUrl] = useState(initial.url ?? '')
  const [secrets, setSecrets] = useState('')
  const isNew = !initial.id
  const valid = name.trim() && (transport === 'http' ? /^https?:\/\//.test(url) : command.trim())
  const submit = () => {
    const server: McpServerConfig = {
      ...initial, id: initial.id || slug(name), name: name.trim(), transport, enabled: initial.enabled ?? true,
      command: transport === 'stdio' ? command.trim() : undefined,
      args: transport === 'stdio' ? args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean) : undefined,
      env: transport === 'stdio' ? parseKV(env) : undefined,
      url: transport === 'http' ? url.trim() : undefined
    }
    // Secrets are only replaced when the field was filled in.
    onSave(server, secrets.trim() ? parseKV(secrets) : undefined)
  }
  const field = 'field h-8 text-[12.5px]'
  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-[130px_1fr] gap-2 items-center text-[12.5px]">
        <span className="text-fg2">{t('Name')}</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Roblox Studio" autoFocus />
        <span className="text-fg2">{t('Type')}</span>
        <div className="flex p-0.5 rounded-lg bg-bg border border-line w-fit">
          {(['stdio', 'http'] as const).map((v) => <button key={v} onClick={() => setTransport(v)} className={`h-7 px-3 rounded-md text-[12.5px] ${transport === v ? 'bg-bg3 text-fg' : 'text-fg3'}`}>{v === 'stdio' ? t('Local program') : t('Remote (HTTP)')}</button>)}
        </div>
        {transport === 'stdio' ? <>
          <span className="text-fg2">{t('Command')}</span><input className={`${field} mono`} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx  /  uvx  /  C:\path\server.exe" />
          <span className="text-fg2 self-start pt-2">{t('Arguments')}</span><textarea className="field mono text-[12px] h-20 py-2 resize-y" value={args} onChange={(e) => setArgs(e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Users\\me\\Documents'} />
          <span className="text-fg2 self-start pt-2">{t('Environment')}</span><textarea className="field mono text-[12px] h-14 py-2 resize-y" value={env} onChange={(e) => setEnv(e.target.value)} placeholder="KEY=value" />
        </> : <>
          <span className="text-fg2">URL</span><input className={`${field} mono`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
        </>}
        <span className="text-fg2 self-start pt-2">{transport === 'http' ? t('Secret headers') : t('Secret variables')}</span>
        <div>
          <textarea className="field mono text-[12px] h-14 py-2 resize-y w-full" value={secrets} onChange={(e) => setSecrets(e.target.value)} placeholder={transport === 'http' ? 'Authorization=Bearer …' : 'API_TOKEN=…'} />
          <div className="text-2xs text-fg3 mt-1">{initial.hasSecrets ? t('Secrets are stored encrypted. Leave empty to keep the current ones.') : t('Stored encrypted. Use for tokens and API keys.')}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel}>{t('cancel')}</button>
        <button className="btn-primary h-8" disabled={!valid} onClick={submit}>{isNew ? t('Add') : t('save')}</button>
      </div>
    </div>
  )
}
