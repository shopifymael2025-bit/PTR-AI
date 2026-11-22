import { useEffect, useState, type ReactNode } from 'react'
import { X, Settings2, Cpu, Bot, Code2, TerminalSquare, Shield, Info, Keyboard, ShieldCheck, ShieldAlert, ShieldQuestion, Plug } from 'lucide-react'
import type { Settings } from '@shared/types'
import { useStore, actions, safe, toast, confirmDialog } from '../../lib/store'
import { invoke } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { eventToShortcut, shortcutLabel, IS_MAC } from '../../lib/shortcuts'
import { ModelsSection } from './ModelsSection'
import { McpSection } from './McpSection'
import { Logo } from '../Logo'
import { UpdateSettings } from '../Updates'
import { TermsViewer } from '../Terms'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 py-3.5 border-b border-line">
      <div className="flex-1"><div className="text-[13.5px]">{label}</div>{hint && <div className="text-[12px] text-fg3 mt-0.5">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} className={`w-9 h-5 rounded-full relative transition-colors ${value ? 'bg-accent' : 'bg-bg3 border border-line'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${value ? 'left-[18px] bg-accent-fg' : 'left-0.5 bg-fg3'}`} /></button>
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return <div className="flex p-0.5 rounded-lg bg-bg border border-line">{options.map((o) => <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={value === o.v} className={`h-7 px-3 rounded-md text-[12.5px] ${value === o.v ? 'bg-bg3 text-fg' : 'text-fg3 hover:text-fg'}`}>{o.l}</button>)}</div>
}
function Num({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return <input type="number" min={min} max={max} value={value} onChange={(e) => { const n = Number(e.target.value); if (n >= min && n <= max) onChange(n) }} className="field w-24 h-8 mono" />
}

function PermissionPicker() {
  const t = useT()
  const mode = useStore((s) => s.settings!.permissionMode ?? 'auto')
  const opts = [
    { v: 'auto' as const, icon: ShieldCheck, title: t('Auto'), desc: t('Auto — PTR AI edits files and runs commands on its own, but asks before dangerous actions (deleting files, recursive deletes, git push, registry, shutdown…). Every edit stays reviewable and revertible in Changes.') },
    { v: 'all' as const, icon: ShieldAlert, title: t('All'), desc: t('All — PTR AI does everything without asking, including risky commands. Access stays limited to the project folder. Use only on projects you can afford to lose or have backed up.') },
    { v: 'approval' as const, icon: ShieldQuestion, title: t('Approval'), desc: t('Approval — PTR AI asks before every edit, move, delete and command.') }
  ]
  const pick = async (v: Settings['permissionMode']) => {
    if (v === 'all' && mode !== 'all' && !(await confirmDialog(t('Allow ALL actions without asking, including dangerous commands?'), { okLabel: t('Enable') }))) return
    actions.updateSettings({ permissionMode: v })
  }
  return (
    <div className="py-4 border-b border-line">
      <div className="text-[13.5px]">{t('Permissions')}</div>
      <div className="text-[12px] text-fg3 mt-0.5 mb-3">{t('What PTR AI may do without asking you')}</div>
      <div className="grid gap-2" role="radiogroup" aria-label={t('Permissions')}>
        {opts.map((o) => (
          <button key={o.v} role="radio" aria-checked={mode === o.v} onClick={() => pick(o.v)}
            className={`text-left rounded-xl border px-4 py-3 flex gap-3 transition-colors ${mode === o.v ? 'border-fg bg-bg3' : 'border-line hover:border-fg3'}`}>
            <o.icon size={18} strokeWidth={1.6} className={o.v === 'all' ? 'text-warn shrink-0 mt-0.5' : 'text-fg2 shrink-0 mt-0.5'} />
            <div><div className="text-[13.5px] font-medium">{o.title}</div><div className="text-[12px] text-fg2 mt-0.5">{o.desc.replace(/^[^—]+— /, '')}</div></div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsModal() {
  const t = useT()
  const s = useStore((x) => x.settings!)
  const section = useStore((x) => x.settingsSection)
  const set = (p: Partial<Settings>) => actions.updateSettings(p)
  const [info, setInfo] = useState<Record<string, unknown> | null>(null)
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  useEffect(() => { invoke<Record<string, unknown>>('app:info').then(setInfo) }, [])
  useEffect(() => {
    if (!recording) return
    const h = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') return setRecording(null); const sc = eventToShortcut(e); if (sc) { set({ shortcuts: { ...s.shortcuts, [recording]: sc } }); setRecording(null) } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [recording, s.shortcuts])

  const sections = [
    { id: 'general', label: t('general'), icon: Settings2 }, { id: 'models', label: t('models'), icon: Cpu }, { id: 'mcp', label: 'MCP', icon: Plug }, { id: 'agent', label: t('agent'), icon: Bot },
    { id: 'editor', label: t('editor'), icon: Code2 }, { id: 'terminal', label: t('terminal'), icon: TerminalSquare }, { id: 'shortcuts', label: t('Shortcuts'), icon: Keyboard },
    { id: 'privacy', label: t('privacy'), icon: Shield }, { id: 'about', label: t('about'), icon: Info }
  ]
  const shortcutLabel = (k: string) => t(k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (m) => m.toUpperCase()))

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-8" onClick={() => useStore.setState({ modal: null })}>
      <div className="w-full max-w-[980px] h-full max-h-[720px] rounded-2xl border border-line bg-bg flex overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('settings')}>
        <nav className="w-[210px] shrink-0 bg-bg2 border-r border-line p-3 flex flex-col gap-0.5">
          <div className="px-2 pb-4 pt-1 text-[22px] font-medium tracking-tight">{t('settings')}</div>
          {sections.map((x) => (
            <button key={x.id} onClick={() => useStore.setState({ settingsSection: x.id })} className={`h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-[13px] ${section === x.id ? 'bg-bg3 text-fg' : 'text-fg2 hover:text-fg'}`}><x.icon size={14} strokeWidth={1.75} />{x.label}</button>
          ))}
        </nav>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-12 shrink-0 flex items-center px-6 border-b border-line"><span className="text-[15px] font-medium">{sections.find((x) => x.id === section)?.label}</span><button className="icon-btn ml-auto" aria-label={t('close')} onClick={() => useStore.setState({ modal: null })}><X size={15} /></button></div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {section === 'general' && <>
              <Row label={t('language')}><Seg value={s.language} onChange={(v) => set({ language: v })} options={[{ v: 'en', l: 'English' }, { v: 'fr', l: 'Français' }]} /></Row>
              <Row label={t('theme')}><Seg value={s.theme} onChange={(v) => set({ theme: v })} options={[{ v: 'dark', l: t('dark') }, { v: 'light', l: t('light') }, { v: 'system', l: t('system') }]} /></Row>
              <Row label={t('On startup')} hint={t('What PTR AI opens when it launches')}><Seg value={s.startup} onChange={(v) => set({ startup: v })} options={[{ v: 'last-project', l: t('Last project') }, { v: 'home', l: t('Home') }]} /></Row>
              <Row label={t('Notifications')} hint={t('Desktop notification when a task finishes or needs approval while PTR AI is in the background')}><Toggle label={t('Notifications')} value={s.notifications} onChange={(v) => set({ notifications: v })} /></Row>
              <Row label={t('Reduce motion')} hint={t('Disable interface animations')}><Toggle label={t('Reduce motion')} value={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} /></Row>
              <Row label={t('Run onboarding again')}><button className="btn-outline h-8" onClick={() => useStore.setState({ modal: 'onboarding' })}>{t('Open')}</button></Row>
            </>}
            {section === 'models' && <ModelsSection />}
            {section === 'mcp' && <McpSection />}
            {section === 'agent' && <>
              <PermissionPicker />
              <Row label={t('Default agent mode')}><Seg value={s.defaultMode} onChange={(v) => set({ defaultMode: v })} options={[{ v: 'ask', l: t('ask') }, { v: 'build', l: t('build') }, { v: 'plan', l: t('plan') }]} /></Row>
              <Row label={t('Maximum steps per task')} hint={t('Stops runaway loops')}><Num value={s.maxIterations} min={1} max={200} onChange={(v) => set({ maxIterations: v })} /></Row>
              <Row label={t('Command timeout (seconds)')}><Num value={s.commandTimeoutSec} min={5} max={3600} onChange={(v) => set({ commandTimeoutSec: v })} /></Row>
              <Row label={t('Context budget (tokens)')} hint={t('Older messages are trimmed and summarized beyond this. Keep it below your model\'s context window.')}><Num value={s.contextBudgetTokens} min={2000} max={1000000} onChange={(v) => set({ contextBudgetTokens: v })} /></Row>
            </>}
            {section === 'editor' && <>
              <Row label={t('Font family')}><input className="field w-56 h-8" value={s.editor.fontFamily} onChange={(e) => set({ editor: { ...s.editor, fontFamily: e.target.value } })} /></Row>
              <Row label={t('Font size')}><Num value={s.editor.fontSize} min={8} max={32} onChange={(v) => set({ editor: { ...s.editor, fontSize: v } })} /></Row>
              <Row label={t('Tab size')}><Num value={s.editor.tabSize} min={1} max={8} onChange={(v) => set({ editor: { ...s.editor, tabSize: v } })} /></Row>
              <Row label={t('Word wrap')}><Toggle label={t('Word wrap')} value={s.editor.wordWrap} onChange={(v) => set({ editor: { ...s.editor, wordWrap: v } })} /></Row>
              <Row label={t('Minimap')}><Toggle label={t('Minimap')} value={s.editor.minimap} onChange={(v) => set({ editor: { ...s.editor, minimap: v } })} /></Row>
              <Row label={t('Auto save')} hint={t('Save one second after you stop typing')}><Toggle label={t('Auto save')} value={s.editor.autoSave} onChange={(v) => set({ editor: { ...s.editor, autoSave: v } })} /></Row>
            </>}
            {section === 'terminal' && <>
              <Row label={t('Default shell')} hint={t('Applies to new terminals')}><Seg value={s.terminal.shell} onChange={(v) => set({ terminal: { ...s.terminal, shell: v } })} options={IS_MAC
                ? [{ v: '/bin/zsh', l: 'zsh' }, { v: '/bin/bash', l: 'bash' }, { v: '/opt/homebrew/bin/pwsh', l: 'PowerShell' }]
                : [{ v: 'powershell.exe', l: 'PowerShell' }, { v: 'pwsh.exe', l: 'PowerShell 7' }, { v: 'cmd.exe', l: 'cmd' }]} /></Row>
              <Row label={t('Font size')}><Num value={s.terminal.fontSize} min={8} max={32} onChange={(v) => set({ terminal: { ...s.terminal, fontSize: v } })} /></Row>
              <Row label={t('Cursor style')}><Seg value={s.terminal.cursorStyle} onChange={(v) => set({ terminal: { ...s.terminal, cursorStyle: v } })} options={[{ v: 'bar', l: t('Bar') }, { v: 'block', l: t('Block') }, { v: 'underline', l: t('Underline') }]} /></Row>
              {Boolean(info?.terminalError) && <p className="text-del text-[12.5px] mt-3">{t('Terminal backend failed to load:')} {String(info?.terminalError)}</p>}
            </>}
            {section === 'shortcuts' && <>
              {Object.entries(s.shortcuts).map(([k, v]) => (
                <Row key={k} label={shortcutLabel(k)}>
                  <button className="btn-outline h-8 mono text-[12px] min-w-[140px]" onClick={() => setRecording(k)}>{recording === k ? t('Press keys…') : shortcutLabel(v)}</button>
                </Row>
              ))}
              <p className="text-2xs text-fg3 mt-3">{t('Enter sends, Shift+Enter inserts a new line in the composer. Ctrl+S saves in the editor.')}</p>
            </>}
            {section === 'privacy' && <>
              <Row label={t('Local data')} hint={t('Conversations, projects and settings are stored only on this computer.')}><button className="btn-outline h-8" onClick={() => invoke('app:dataDir')}>{t('Open folder')}</button></Row>
              <Row label={t('Credential storage')} hint={info?.encryption ? t('API keys are encrypted with Windows DPAPI via Electron safeStorage.') : t('OS encryption is unavailable — keys are stored unencrypted in the data folder.')}><span className={`text-[12px] ${info?.encryption ? 'text-add' : 'text-warn'}`}>{info?.encryption ? t('Encrypted') : t('Not encrypted')}</span></Row>
              <Row label={t('Export conversations')} hint={t('Save all conversations as JSON')}><button className="btn-outline h-8" onClick={async () => { const p = await safe(invoke<string | null>('app:exportConversations')); if (p) toast(`${t('Exported to')} ${p}`) }}>{t('Export…')}</button></Row>
              <Row label={t('Clear history')} hint={t('Deletes every conversation and change record. Files in your projects are not touched.')}><button className="btn-outline h-8 hover:text-del" onClick={async () => { if (await confirmDialog(t('Delete ALL conversation history? This cannot be undone.'))) { await invoke('app:clearHistory'); useStore.setState({ tabs: [], convId: null, messages: {} }); actions.loadConversations(); toast(t('History cleared')) } }}>{t('Clear…')}</button></Row>
              <p className="text-[12px] text-fg3 mt-4 leading-relaxed">{t('With Ollama, inference stays on this machine. With cloud providers, your messages and any file contents or command output the agent reads are sent to that provider. Likely secrets (API keys, tokens) are redacted from tool output before it is sent.')}</p>
            </>}
            {section === 'about' && <>
              <div className="flex items-center gap-4 py-4"><Logo size={36} /><div><div className="text-[13px] text-fg3 mono">v{String(info?.version ?? '')}</div><div className="text-fg2 text-[13px]">{t('tagline')}</div></div></div>
              <Row label={t('Version')}><span className="mono text-[12.5px]">{String(info?.version ?? '')}</span></Row>
              <Row label={t('Runtime')}><span className="mono text-[12px] text-fg2">Electron {String(info?.electron ?? '')} · Node {String(info?.node ?? '')}</span></Row>
              <Row label={t('License')}><button className="text-[12.5px] underline underline-offset-2 hover:text-fg" onClick={() => invoke('app:openExternal', 'https://github.com/solarynteam/ptr-ai/blob/main/LICENSE')}>{t('Proprietary — all rights reserved')}</button></Row>
              <Row label={t('Terms of Service')} hint={s.tosAcceptedAt ? `${t('Accepted on')} ${new Date(s.tosAcceptedAt).toLocaleDateString(s.language === 'fr' ? 'fr-FR' : 'en-GB')} · v${s.tosAcceptedVersion ?? ''}` : undefined}><button className="btn-outline h-8" onClick={() => setShowTerms(true)}>{t('Read')}</button></Row>
              <UpdateSettings />
              <Row label={t('Diagnostics')}><button className="btn-outline h-8" onClick={async () => setDiag(await invoke('app:diagnostics'))}>{t('Run')}</button></Row>
              {diag && <pre className="mono text-[11.5px] card p-3 mt-3 selectable whitespace-pre-wrap">{JSON.stringify(diag, null, 2)}</pre>}
              {Boolean(info?.dbRecoveredFrom) && <p className="text-warn text-[12.5px] mt-3">{t('The conversation database was unreadable at startup and was moved to')} {String(info?.dbRecoveredFrom)}. {t('A new database was created.')}</p>}
            </>}
          </div>
        </div>
      </div>
      {showTerms && <TermsViewer onClose={() => setShowTerms(false)} />}
    </div>
  )
}
