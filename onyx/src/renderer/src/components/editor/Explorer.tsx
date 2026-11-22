import { useEffect, useState } from 'react'
import { ChevronRight, File, Folder, FolderOpen, RefreshCw, Search, Paperclip } from 'lucide-react'
import type { DirEntry } from '@shared/types'
import { useStore, actions } from '../../lib/store'
import { invoke } from '../../lib/api'
import { useT } from '../../lib/i18n'

function Node({ entry, depth }: { entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false)
  const active = useStore((s) => s.activeFile === entry.path)
  const pad = { paddingLeft: 8 + depth * 12 }
  if (!entry.isDir) {
    return (
      <button style={pad} onClick={() => actions.openFile(entry.path)} title={entry.path}
        className={`w-full h-[26px] pr-2 flex items-center gap-1.5 text-[12.5px] text-left ${active ? 'bg-bg3 text-fg' : 'text-fg2 hover:bg-bg3/60 hover:text-fg'}`}>
        <span className="w-3" /><File size={13} strokeWidth={1.5} className="shrink-0 text-fg3" /><span className="truncate">{entry.name}</span>
      </button>
    )
  }
  return (
    <div>
      <button style={pad} onClick={() => setOpen(!open)} aria-expanded={open} className="w-full h-[26px] pr-2 flex items-center gap-1.5 text-[12.5px] text-fg2 hover:bg-bg3/60 hover:text-fg text-left">
        <ChevronRight size={12} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? <FolderOpen size={13} strokeWidth={1.5} className="shrink-0" /> : <Folder size={13} strokeWidth={1.5} className="shrink-0" />}
        <span className="truncate">{entry.name}</span>
      </button>
      {open && <Children path={entry.path} depth={depth + 1} />}
    </div>
  )
}

function Children({ path, depth }: { path: string; depth: number }) {
  const projectId = useStore((s) => s.projectId)
  const version = useStore((s) => s.fsVersion)
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!projectId) return
    invoke<DirEntry[]>('fs:list', { projectId, path }).then((e) => { setEntries(e); setErr(null) }).catch((e) => setErr((e as Error).message))
  }, [projectId, path, version])
  if (err) return <div className="text-2xs text-del px-3 py-1" style={{ paddingLeft: 8 + depth * 12 }}>{err}</div>
  if (!entries) return null
  return <>{entries.map((e) => <Node key={e.path} entry={e} depth={depth} />)}</>
}

export function Explorer() {
  const t = useT()
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId))
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<string[] | null>(null)

  useEffect(() => {
    if (!q.trim() || !project) { setHits(null); return }
    const h = setTimeout(() => invoke<string[]>('fs:searchContent', { projectId: project.id, query: q }).then(setHits).catch(() => setHits([])), 250)
    return () => clearTimeout(h)
  }, [q, project?.id])

  if (!project) return null
  return (
    <div className="h-full flex flex-col bg-bg2">
      <div className="h-9 shrink-0 px-3 flex items-center gap-2 border-b border-line">
        <span className="label">{t('explorer')}</span>
        <span className="text-2xs text-fg3 truncate mono">{project.name}</span>
        <button className="icon-btn ml-auto" title="Refresh" aria-label="Refresh explorer" onClick={() => useStore.setState((s) => ({ fsVersion: s.fsVersion + 1 }))}><RefreshCw size={12} /></button>
      </div>
      <div className="p-2"><div className="relative"><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search in files')} className="field h-7 pl-7 text-[12px]" /></div></div>
      <div className="flex-1 overflow-auto pb-4">
        {hits ? (
          hits.length === 0 ? <div className="px-3 text-2xs text-fg3">{t('No results')}</div> :
          hits.map((h, i) => { const [file, line, ...rest] = h.split(':'); return (
            <button key={i} className="w-full text-left px-3 py-1 hover:bg-bg3/60" onClick={() => actions.openFile(file)}>
              <div className="text-2xs mono text-fg2 truncate">{file}:{line}</div><div className="text-[11.5px] text-fg3 truncate mono">{rest.join(':').trim()}</div>
            </button>
          ) })
        ) : <Children path="." depth={0} />}
      </div>
      <div className="p-2 border-t border-line text-2xs text-fg3 flex items-center gap-1.5"><Paperclip size={11} />{t('Type @ in chat to attach a file')}</div>
    </div>
  )
}
