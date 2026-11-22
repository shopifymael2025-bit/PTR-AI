import { useState } from 'react'
import { ChevronRight, FileText, FolderTree, Search, FilePlus, FilePen, Trash2, MoveRight, Terminal, ListChecks, Check, X, Ban, Loader2, FolderPlus, Plug } from 'lucide-react'
import type { ApprovalRequest, ChatMessage, ToolCall } from '@shared/types'
import { actions } from '../../lib/store'
import { useT } from '../../lib/i18n'
import { InlineDiff, diffStats } from './DiffView'

const ICONS: Record<string, typeof FileText> = {
  list_directory: FolderTree, read_file: FileText, search_files: Search, search_content: Search, create_file: FilePlus, write_file: FilePen,
  apply_patch: FilePen, delete_file: Trash2, move_file: MoveRight, create_directory: FolderPlus, run_command: Terminal, submit_plan: ListChecks, update_plan_step: ListChecks
}

function summary(call: ToolCall): string {
  const a = call.args as Record<string, string>
  switch (call.name) {
    case 'list_directory': return `List ${a.path || '.'}`
    case 'read_file': return `Read ${a.path}`
    case 'search_files': return `Find files “${a.pattern}”`
    case 'search_content': return `Search “${a.query}”`
    case 'create_file': return `Create ${a.path}`
    case 'write_file': return `Write ${a.path}`
    case 'apply_patch': return `Edit ${a.path}`
    case 'delete_file': return `Delete ${a.path}`
    case 'move_file': return `Move ${a.from} → ${a.to}`
    case 'create_directory': return `Create folder ${a.path}`
    case 'run_command': return a.command
    case 'submit_plan': return 'Submitted a plan'
    case 'update_plan_step': return `Plan step ${a.index} → ${a.status}`
    default:
      if (call.name.startsWith('mcp__')) { const [, server, tool] = call.name.split('__'); return `${server} · ${tool}` }
      return call.name
  }
}

export function ToolCard({ call, result, liveOutput, running }: { call: ToolCall; result?: ChatMessage; liveOutput?: string; running: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const Icon = call.name.startsWith('mcp__') ? Plug : ICONS[call.name] ?? FileText
  const isCmd = call.name === 'run_command'
  const pending = !result
  const ok = result?.toolMeta?.ok
  const denied = result?.toolMeta?.denied
  return (
    <div className="my-1.5 rounded-lg border border-line bg-bg2 overflow-hidden">
      <button className="w-full h-8 px-2.5 flex items-center gap-2 text-left text-[12.5px] hover:bg-bg3/50" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight size={12} className={`text-fg3 transition-transform ${open ? 'rotate-90' : ''}`} />
        <Icon size={13} strokeWidth={1.75} className="text-fg2 shrink-0" />
        <span className={`truncate ${isCmd ? 'mono text-[12px]' : ''}`}>{summary(call)}</span>
        <span className="ml-auto shrink-0">
          {pending ? (running ? <Loader2 size={12} className="animate-spin text-fg3" /> : <Ban size={12} className="text-fg3" />)
            : denied ? <span className="text-2xs text-warn">{t('denied')}</span>
            : ok ? <Check size={13} className="text-add" /> : <X size={13} className="text-del" />}
        </span>
      </button>
      {(open || (isCmd && pending && liveOutput)) && (
        <div className="border-t border-line">
          {call.name !== 'run_command' && <pre className="px-3 py-2 text-2xs mono text-fg3 whitespace-pre-wrap break-all max-h-32 overflow-auto selectable">{JSON.stringify(call.args, null, 1).slice(0, 2000)}</pre>}
          {(result?.content || liveOutput) && <pre className="px-3 py-2 text-[11.5px] mono text-fg2 whitespace-pre-wrap break-words max-h-72 overflow-auto selectable border-t border-line bg-bg">{result?.content ?? liveOutput}</pre>}
        </div>
      )}
    </div>
  )
}

export function ApprovalCard({ req }: { req: ApprovalRequest }) {
  const t = useT()
  const isEdit = req.kind === 'edit' || req.kind === 'delete'
  const stats = isEdit ? diffStats(req.before ?? '', req.after ?? '') : null
  return (
    <div className={`my-3 rounded-xl border bg-bg2 overflow-hidden ${req.danger && req.kind === 'command' ? 'border-warn/60' : 'border-fg3/60'}`} role="alertdialog" aria-label={req.title}>
      <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-line">
        <span className="label text-fg2">{t('approvalNeeded')}</span>
        <span className="text-[13px] font-medium truncate">{req.title}</span>
        {stats && <span className="ml-auto mono text-2xs"><span className="text-add">+{stats.added}</span> <span className="text-del">−{stats.removed}</span></span>}
      </div>
      {req.kind === 'mcp' && (
        <div className="px-3.5 py-3 space-y-2">
          <pre className="mono text-[12px] bg-bg border border-line rounded-lg px-3 py-2 whitespace-pre-wrap break-all max-h-56 overflow-auto selectable">{req.command}</pre>
          {req.danger && <div className="text-[12.5px] text-warn">⚠ {req.danger}</div>}
        </div>
      )}
      {req.kind === 'command' && (
        <div className="px-3.5 py-3 space-y-2">
          <pre className="mono text-[12.5px] bg-bg border border-line rounded-lg px-3 py-2 whitespace-pre-wrap break-all selectable">{req.command}</pre>
          <div className="text-2xs text-fg3 mono">cwd: {req.cwd}</div>
          {req.danger && <div className="text-[12.5px] text-warn">⚠ {req.danger}. Review carefully before allowing.</div>}
        </div>
      )}
      {isEdit && <InlineDiff before={req.before ?? ''} after={req.after ?? ''} />}
      {req.kind === 'move' && <div className="px-3.5 py-3 text-[13px] text-fg2">{req.title}</div>}
      {req.kind === 'delete' && req.danger && <div className="px-3.5 py-2 text-[12.5px] text-warn border-t border-line">{req.danger}</div>}
      <div className="px-3.5 py-2.5 flex items-center gap-2 border-t border-line">
        {isEdit && req.path && <button className="btn h-7" onClick={() => actions.showDiff(req.path!, req.before ?? '', req.after ?? '')}>{t('openInEditor')}</button>}
        <div className="ml-auto flex gap-2">
          <button className="btn-outline h-8" onClick={() => actions.approve(req, 'deny')}>{t('deny')}</button>
          {req.allowKey && <button className="btn-outline h-8" title={`Always allow commands starting with “${req.allowKey}” in this project`} onClick={() => actions.approve(req, 'always')}>{t('alwaysAllow')} <span className="mono text-2xs text-fg3">{req.allowKey}</span></button>}
          <button className="btn-primary h-8" autoFocus onClick={() => actions.approve(req, 'allow')}>{t('allow')}</button>
        </div>
      </div>
    </div>
  )
}
