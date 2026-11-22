import { useEffect, useState } from 'react'
import { X, Undo2, Redo2, ExternalLink, RefreshCw, Plus, Minus, GitCommit, ChevronRight } from 'lucide-react'
import type { FileChange, GitStatus } from '@shared/types'
import { useStore, actions, safe, toast, confirmDialog } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'
import { InlineDiff, diffStats } from './chat/DiffView'

export function RightPanel() {
  const panel = useStore((s) => s.rightPanel)
  const t = useT()
  return (
    <div className="h-full flex flex-col">
      <div className="h-10 shrink-0 px-3 flex items-center border-b border-line">
        <span className="label">{panel === 'git' ? t('git') : t('changes')}</span>
        <button className="icon-btn ml-auto" aria-label={t('close')} onClick={() => useStore.setState({ rightPanel: null })}><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">{panel === 'git' ? <GitPanel /> : <ChangesPanel />}</div>
    </div>
  )
}

function ChangesPanel() {
  const t = useT()
  const convId = useStore((s) => s.convId)
  const msgCount = useStore((s) => (s.convId ? s.messages[s.convId]?.length : 0))
  const [changes, setChanges] = useState<FileChange[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const load = () => { if (convId) invoke<FileChange[]>('changes:list', convId).then(setChanges) }
  useEffect(load, [convId, msgCount])

  if (!convId || !changes.length) return <div className="p-4 text-[13px] text-fg3">{t('noChanges')}</div>

  // Group by run (agent task), newest first.
  const runs = [...new Set(changes.map((c) => c.runId))].reverse()
  const act = async (ch: FileChange, kind: 'revert' | 'reapply') => {
    try { await invoke(kind === 'revert' ? 'changes:revert' : 'changes:reapply', { id: ch.id }) }
    catch (e) {
      if (!(await confirmDialog(`${t('Overwrite anyway?')}\n\n${(e as Error).message}`, { okLabel: t('Overwrite') }))) return
      await safe(invoke(kind === 'revert' ? 'changes:revert' : 'changes:reapply', { id: ch.id, force: true }))
    }
    load(); actions.reloadFile(ch.path); useStore.setState((s) => ({ fsVersion: s.fsVersion + 1 }))
  }
  return (
    <div className="p-2 space-y-4">
      {runs.map((run, ri) => {
        const list = changes.filter((c) => c.runId === run)
        const applied = list.filter((c) => c.status === 'applied')
        return (
          <div key={run}>
            <div className="px-1 pb-1.5 flex items-center gap-2">
              <span className="text-[12.5px] font-medium">{ri === 0 ? t('Latest task') : `${t('Task')} ${runs.length - ri}`}</span>
              <span className="text-2xs text-fg3">{t('Modified files')} ({list.length})</span>
              {applied.length > 1 && <button className="btn h-6 text-2xs ml-auto" onClick={async () => { if (await confirmDialog(`${t('Revert all changes from this task?')} (${applied.length})`, { okLabel: t('Revert all') })) for (const c of [...applied].reverse()) await act(c, 'revert') }}><Undo2 size={11} />{t('Revert all')}</button>}
            </div>
            {list.map((ch) => {
              const st = diffStats(ch.before ?? '', ch.after ?? '')
              return (
                <div key={ch.id} className="rounded-lg border border-line bg-bg mb-1.5 overflow-hidden">
                  <div className="h-8 px-2 flex items-center gap-1.5 text-[12px]">
                    <button className="flex items-center gap-1.5 min-w-0 flex-1 text-left" onClick={() => setOpen(open === ch.id ? null : ch.id)}>
                      <ChevronRight size={12} className={`shrink-0 text-fg3 ${open === ch.id ? 'rotate-90' : ''}`} />
                      <span className={`mono truncate ${ch.status === 'reverted' ? 'line-through text-fg3' : ''}`}>{ch.path}</span>
                    </button>
                    <span className="mono text-2xs shrink-0"><span className="text-add">+{st.added}</span> <span className="text-del">−{st.removed}</span></span>
                    {ch.after !== null && <button className="icon-btn w-6 h-6" title={t('openInEditor')} aria-label={t('openInEditor')} onClick={() => actions.openFile(ch.path)}><ExternalLink size={12} /></button>}
                    {ch.status === 'applied'
                      ? <button className="icon-btn w-6 h-6" title={t('revert')} aria-label={t('revert')} onClick={() => act(ch, 'revert')}><Undo2 size={12} /></button>
                      : <button className="icon-btn w-6 h-6" title={t('reapply')} aria-label={t('reapply')} onClick={() => act(ch, 'reapply')}><Redo2 size={12} /></button>}
                  </div>
                  {open === ch.id && <div className="border-t border-line"><InlineDiff before={ch.before ?? ''} after={ch.after ?? ''} maxHeight={420} /></div>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function GitPanel() {
  const t = useT()
  const projectId = useStore((s) => s.projectId)!
  const fsVersion = useStore((s) => s.fsVersion)
  const [st, setSt] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<{ hash: string; author: string; when: string; subject: string }[]>([])
  const [msg, setMsg] = useState('')
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)
  const load = async () => { setSt(await invoke<GitStatus>('git:status', projectId)); setLog(await invoke('git:log', projectId).catch(() => []) as typeof log) }
  useEffect(() => { load() }, [projectId, fsVersion])

  if (!st) return <div className="p-4 text-fg3 text-[13px]">{t('Loading…')}</div>
  if (!st.available) return <div className="p-4 text-[13px] text-fg2">{st.error} <button className="underline" onClick={() => invoke('app:openExternal', 'https://git-scm.com/download/win')}>{t('Download Git')}</button></div>
  if (!st.isRepo) return <div className="p-4 text-[13px] text-fg2">{t('This folder is not a Git repository.')}{st.error && <div className="mt-2 text-2xs text-fg3 mono">{st.error}</div>}</div>

  const staged = st.files.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstaged = st.files.filter((f) => f.worktree !== ' ')
  const showDiff = async (p: string, s: boolean) => setDiff({ path: p, text: await invoke<string>('git:diff', { projectId, path: p, staged: s }) })
  const row = (f: GitStatus['files'][number], s: boolean) => (
    <div key={(s ? 's' : 'u') + f.path} className="group h-7 px-2 flex items-center gap-2 text-[12px] rounded hover:bg-bg3">
      <span className="mono text-2xs w-4 text-fg3">{s ? f.index : f.worktree === '?' ? 'U' : f.worktree}</span>
      <button className="mono truncate flex-1 text-left" onClick={() => showDiff(f.path, s)}>{f.path}</button>
      <button className="icon-btn w-6 h-6 opacity-0 group-hover:opacity-100" title={s ? 'Unstage' : 'Stage'} aria-label={s ? 'Unstage' : 'Stage'}
        onClick={async () => { await safe(invoke(s ? 'git:unstage' : 'git:stage', { projectId, paths: [f.path] })); load() }}>{s ? <Minus size={12} /> : <Plus size={12} />}</button>
    </div>
  )
  return (
    <div className="p-2 space-y-3">
      <div className="px-1 flex items-center gap-2 text-[12.5px]"><GitCommit size={13} /> <span className="mono">{st.branch}</span><button className="icon-btn ml-auto" aria-label="Refresh" onClick={load}><RefreshCw size={12} /></button></div>
      <div className="space-y-1.5">
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('Commit message')} className="field h-16 py-2 resize-none" />
        <button className="btn-primary w-full h-8" disabled={!msg.trim() || !staged.length} onClick={async () => {
          if (!(await confirmDialog(`${t('Commit staged files?')} (${staged.length} → ${st.branch})\n\n${msg}`, { danger: false, okLabel: t('Commit') }))) return
          if (await safe(invoke('git:commit', { projectId, message: msg })) !== undefined) { setMsg(''); toast('Committed'); load() }
        }}>{t('Commit')} {staged.length ? `(${staged.length})` : ''}</button>
        <div className="text-2xs text-fg3">{t('PTR AI never pushes, resets or deletes branches automatically.')}</div>
      </div>
      <div><div className="label px-1 mb-1">{t('Staged')} ({staged.length})</div>{staged.map((f) => row(f, true))}</div>
      <div><div className="label px-1 mb-1 flex items-center">{t('changes')} ({unstaged.length}){unstaged.length > 0 && <button className="ml-auto normal-case tracking-normal text-2xs hover:text-fg" onClick={async () => { await safe(invoke('git:stage', { projectId, paths: unstaged.map((f) => f.path) })); load() }}>{t('Stage all')}</button>}</div>{unstaged.map((f) => row(f, false))}</div>
      {diff && <div className="rounded-lg border border-line overflow-hidden"><div className="h-7 px-2 flex items-center text-2xs mono border-b border-line">{diff.path}<button className="icon-btn w-5 h-5 ml-auto" aria-label="Close diff" onClick={() => setDiff(null)}><X size={11} /></button></div>
        <pre className="text-[11px] mono p-2 overflow-auto max-h-80 selectable">{diff.text ? diff.text.split('\n').map((l, i) => <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'text-add' : l.startsWith('-') && !l.startsWith('---') ? 'text-del' : l.startsWith('@@') ? 'text-fg3' : ''}>{l || ' '}</div>) : '(untracked or no diff)'}</pre></div>}
      <div><div className="label px-1 mb-1">{t('Recent commits')}</div>
        {log.map((c) => <div key={c.hash} className="px-2 py-1 text-[12px]"><div className="truncate">{c.subject}</div><div className="text-2xs text-fg3 mono">{c.hash} · {c.author} · {c.when}</div></div>)}
        {!log.length && <div className="px-2 text-2xs text-fg3">{t('No commits yet.')}</div>}
      </div>
    </div>
  )
}
