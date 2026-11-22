import { useEffect, useMemo, useState } from 'react'
import { Search, FileText } from 'lucide-react'
import { useStore, actions } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'
import { shortcutLabel } from '../lib/shortcuts'

function Shell({ children, placeholder, q, setQ, onKey }: { children: React.ReactNode; placeholder: string; q: string; setQ: (v: string) => void; onKey: (e: React.KeyboardEvent) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-center pt-[12vh]" onClick={() => useStore.setState({ modal: null })}>
      <div className="w-[600px] max-h-[60vh] card shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-line"><Search size={15} className="text-fg3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-fg3" />
        </div>
        <div className="overflow-y-auto p-1.5">{children}</div>
      </div>
    </div>
  )
}

export function CommandPalette() {
  const t = useT()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const convs = useStore((s) => s.conversations)
  const projects = useStore((s) => s.projects)
  const close = () => useStore.setState({ modal: null })
  const items = useMemo(() => {
    const cmds: { label: string; hint?: string; run: () => void }[] = [
      { label: t('New session'), hint: shortcutLabel('Ctrl+N'), run: () => actions.newConversation() },
      { label: t('Open project…'), hint: shortcutLabel('Ctrl+O'), run: () => actions.openProjectDialog() },
      { label: t('New workspace…'), run: () => actions.openProjectDialog(true) },
      { label: t('Go to file…'), hint: shortcutLabel('Ctrl+P'), run: () => setTimeout(() => useStore.setState({ modal: 'quickOpen' })) },
      { label: 'Layout: Chat', run: () => actions.setLayout('chat') },
      { label: 'Layout: Code', run: () => actions.setLayout('code') },
      { label: 'Layout: Workspace', run: () => actions.setLayout('workspace') },
      { label: 'Mode: Ask', run: () => actions.setMode('ask') },
      { label: 'Mode: Build', run: () => actions.setMode('build') },
      { label: 'Mode: Plan', run: () => actions.setMode('plan') },
      { label: t('Toggle theme'), run: () => { const s = useStore.getState().settings!; actions.updateSettings({ theme: s.theme === 'light' ? 'dark' : 'light' }) } },
      { label: t('Show changes'), run: () => useStore.setState({ rightPanel: 'changes' }) },
      { label: t('Source control'), run: () => useStore.setState({ rightPanel: 'git' }) },
      { label: t('Refresh models'), run: () => actions.refreshModels() },
      { label: t('settings'), run: () => setTimeout(() => useStore.setState({ modal: 'settings' })) },
      ...projects.map((p) => ({ label: `Project: ${p.name}`, hint: p.path, run: () => actions.openProject(p.id) })),
      ...convs.map((c) => ({ label: `Session: ${c.title}`, run: () => actions.openConversation(c.id) }))
    ]
    return cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  }, [q, convs, projects])
  useEffect(() => setIdx(0), [q])
  const run = (i: number) => { close(); items[i]?.run() }
  return (
    <Shell q={q} setQ={setQ} placeholder={t('Type a command or search sessions…')} onKey={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((idx + 1) % Math.max(1, items.length)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((idx - 1 + items.length) % Math.max(1, items.length)) }
      if (e.key === 'Enter') run(idx)
    }}>
      {items.map((c, i) => (
        <button key={c.label + i} onMouseEnter={() => setIdx(i)} onClick={() => run(i)} className={`w-full h-9 px-3 rounded-lg flex items-center text-[13px] text-left ${i === idx ? 'bg-bg3 text-fg' : 'text-fg2'}`}>
          <span className="truncate">{c.label}</span>{c.hint && <span className="ml-auto pl-4 text-2xs mono text-fg3 truncate max-w-[50%]">{c.hint}</span>}
        </button>
      ))}
    </Shell>
  )
}

export function QuickOpen() {
  const t = useT()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [res, setRes] = useState<string[]>([])
  const projectId = useStore((s) => s.projectId)
  useEffect(() => {
    const h = setTimeout(() => { if (projectId) invoke<string[]>('fs:searchFiles', { projectId, query: q }).then((r) => { setRes(r.slice(0, 60)); setIdx(0) }) }, 80)
    return () => clearTimeout(h)
  }, [q, projectId])
  const open = (i: number) => { const f = res[i]; useStore.setState({ modal: null }); if (f) actions.openFile(f) }
  return (
    <Shell q={q} setQ={setQ} placeholder={t('Search files by name…')} onKey={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((idx + 1) % Math.max(1, res.length)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((idx - 1 + res.length) % Math.max(1, res.length)) }
      if (e.key === 'Enter') open(idx)
    }}>
      {res.map((f, i) => (
        <button key={f} onMouseEnter={() => setIdx(i)} onClick={() => open(i)} className={`w-full h-8 px-3 rounded-lg flex items-center gap-2 text-[13px] text-left ${i === idx ? 'bg-bg3 text-fg' : 'text-fg2'}`}>
          <FileText size={13} className="text-fg3 shrink-0" /><span className="truncate">{f.split('/').pop()}</span><span className="text-2xs mono text-fg3 truncate">{f}</span>
        </button>
      ))}
      {!res.length && <div className="px-3 py-2 text-[13px] text-fg3">{t('No files')}</div>}
    </Shell>
  )
}
