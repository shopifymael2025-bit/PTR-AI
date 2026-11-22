import { useMemo, useState } from 'react'
import { SquarePen, FolderOpen, FolderPlus, Settings, Search, MoreHorizontal, Pin, Trash2, Pencil, Loader2, Folder, GitBranch, AlertTriangle, ChevronDown, X } from 'lucide-react'
import { useStore, actions, safe, confirmDialog } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'
import { shortcutLabel } from '../lib/shortcuts'

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function Sidebar() {
  const t = useT()
  const projects = useStore((s) => s.projects)
  const projectId = useStore((s) => s.projectId)
  const convs = useStore((s) => s.conversations)
  const convId = useStore((s) => s.convId)
  const live = useStore((s) => s.live)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [projOpen, setProjOpen] = useState(true)

  const list = useMemo(() => {
    const f = convs.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()))
    return [...f.filter((c) => c.pinned), ...f.filter((c) => !c.pinned)]
  }, [convs, q])
  const active = list.filter((c) => live[c.id]?.running)

  const rename = async (id: string, title: string) => { setRenaming(null); if (title.trim()) { await safe(invoke('conv:rename', { id, title: title.trim() })); actions.loadConversations() } }
  const del = async (id: string) => {
    if (!(await confirmDialog(t('Delete this conversation and its history? This cannot be undone.')))) return
    await safe(invoke('conv:delete', id)); actions.closeTab(id); actions.loadConversations()
  }
  const pin = async (id: string, pinned: boolean) => { await invoke('conv:update', { id, pinned }); actions.loadConversations() }

  return (
    <aside className="w-[260px] h-full flex flex-col bg-bg2" onClick={() => setMenu(null)}>
      <div className="p-2 flex flex-col gap-0.5">
        <button className="btn justify-start w-full" onClick={() => actions.newConversation()}><SquarePen size={15} strokeWidth={1.75} />{t('newChat')}<span className="ml-auto text-2xs text-fg3 mono">{shortcutLabel('Ctrl+N')}</span></button>
        <button className="btn justify-start w-full" onClick={() => actions.openProjectDialog()}><FolderOpen size={15} strokeWidth={1.75} />{t('openProject')}<span className="ml-auto text-2xs text-fg3 mono">{shortcutLabel('Ctrl+O')}</span></button>
        <button className="btn justify-start w-full" onClick={() => actions.openProjectDialog(true)}><FolderPlus size={15} strokeWidth={1.75} />{t('newWorkspace')}</button>
      </div>

      <div className="px-3 pt-2">
        <button className="label flex items-center gap-1 w-full mb-1.5" onClick={() => setProjOpen(!projOpen)}>{t('recentProjects')}<ChevronDown size={12} className={projOpen ? '' : '-rotate-90'} /></button>
        {projOpen && (
          <div className="flex flex-col gap-0.5 max-h-[180px] overflow-y-auto">
            <button onClick={() => actions.openProject(null)} className={`h-7 px-2 rounded-md flex items-center gap-2 text-[12.5px] text-left ${projectId === null ? 'bg-bg3 text-fg' : 'text-fg2 hover:bg-bg3'}`}>
              <Folder size={13} className="shrink-0 opacity-50" /> <span className="truncate italic">{t('noProject')}</span>
            </button>
            {projects.map((p) => (
              <div key={p.id} className={`group h-7 pl-2 pr-1 rounded-md flex items-center gap-2 text-[12.5px] ${projectId === p.id ? 'bg-bg3 text-fg' : 'text-fg2 hover:bg-bg3'}`} title={p.path}>
                <button className="flex-1 min-w-0 flex items-center gap-2 text-left" disabled={p.missing} onClick={() => actions.openProject(p.id)}>
                  {p.missing ? <AlertTriangle size={13} className="text-warn shrink-0" /> : p.isGit ? <GitBranch size={13} className="shrink-0" /> : <Folder size={13} className="shrink-0" />}
                  <span className={`truncate ${p.missing ? 'line-through opacity-60' : ''}`}>{p.name}</span>
                </button>
                <button className="opacity-0 group-hover:opacity-100 w-5 h-5 grid place-items-center rounded hover:bg-bg2" title={t('remove')} aria-label={t('remove')}
                  onClick={async () => { if (await confirmDialog(`${t('Remove this project from PTR AI?')} — ${p.name}\n\n${t('Its conversations are deleted from PTR AI; files on disk are not touched.')}`, { okLabel: t('remove') })) { await invoke('projects:remove', p.id); if (projectId === p.id) actions.openProject(null); else actions.refreshProjects() } }}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 pt-4 pb-1.5 flex items-center gap-2">
        <span className="label">{t('history')}</span>
      </div>
      <div className="px-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="field h-8 pl-8 bg-bg" />
        </div>
      </div>

      {active.length > 0 && (
        <div className="px-3 pt-3"><div className="label mb-1">{t('Active')}</div>
          {active.map((c) => <div key={c.id} onClick={() => actions.openConversation(c.id)} className="h-7 flex items-center gap-2 text-[12.5px] text-fg cursor-default"><Loader2 size={12} className="animate-spin" /><span className="truncate">{c.title}</span></div>)}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
        {list.length === 0 && <div className="text-fg3 text-[12.5px] px-2 py-3">{t('noConversations')}</div>}
        {list.map((c) => (
          <div key={c.id} onClick={() => actions.openConversation(c.id)}
            className={`group relative h-8 px-2 rounded-md flex items-center gap-2 text-[13px] cursor-default ${c.id === convId ? 'bg-bg3 text-fg' : 'text-fg2 hover:bg-bg3/60 hover:text-fg'}`}>
            {c.pinned && <Pin size={11} className="shrink-0 text-fg3" />}
            {renaming === c.id
              ? <input autoFocus defaultValue={c.title} className="field h-6 px-1.5" onClick={(e) => e.stopPropagation()} onBlur={(e) => rename(c.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename(c.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenaming(null) }} />
              : <span className="truncate flex-1">{c.title}</span>}
            {c.runState === 'interrupted' && <AlertTriangle size={12} className="text-warn shrink-0" aria-label="Interrupted" />}
            <span className="text-2xs text-fg3 group-hover:hidden">{ago(c.updatedAt)}</span>
            <button className="hidden group-hover:grid w-5 h-5 place-items-center rounded hover:bg-bg2" aria-label="More" onClick={(e) => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id) }}><MoreHorizontal size={13} /></button>
            {menu === c.id && (
              <div className="absolute right-1 top-8 z-30 w-40 card p-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <button className="btn w-full justify-start h-7" onClick={() => { setMenu(null); setRenaming(c.id) }}><Pencil size={13} />{t('rename')}</button>
                <button className="btn w-full justify-start h-7" onClick={() => { setMenu(null); pin(c.id, !c.pinned) }}><Pin size={13} />{c.pinned ? t('unpin') : t('pin')}</button>
                <button className="btn w-full justify-start h-7 hover:text-del" onClick={() => { setMenu(null); del(c.id) }}><Trash2 size={13} />{t('delete')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-line">
        <button className="btn w-full justify-start" onClick={() => useStore.setState({ modal: 'settings' })}><Settings size={15} strokeWidth={1.75} />{t('settings')}</button>
      </div>
    </aside>
  )
}
