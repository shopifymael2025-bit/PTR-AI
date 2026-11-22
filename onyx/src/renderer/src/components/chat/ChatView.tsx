import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Copy, Pencil, RotateCcw, AlertCircle, Check, Brain, CircleDot, CircleCheck, Circle, CircleSlash, Paperclip } from 'lucide-react'
import type { ChatMessage } from '@shared/types'
import { useStore, actions, useLive } from '../../lib/store'
import { useT } from '../../lib/i18n'
import { Markdown } from './Markdown'
import { ToolCard, ApprovalCard } from './ToolCard'
import { Composer } from './Composer'
import { IntroLogo } from '../Logo'

const PAGE = 80

export function ChatView() {
  const t = useT()
  const convId = useStore((s) => s.convId)
  const messages = useStore((s) => (s.convId ? s.messages[s.convId] : undefined)) ?? []
  const conv = useStore((s) => s.conversations.find((c) => c.id === s.convId))
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId))
  const plan = useStore((s) => (s.convId ? s.plans[s.convId] : undefined))
  const live = useLive(convId)
  const scroller = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => { setLimit(PAGE); setStick(true) }, [convId])
  useEffect(() => { if (stick && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight }, [messages.length, live.text, live.approvals.length, live.toolOutput, stick])

  const results = useMemo(() => {
    const m = new Map<string, ChatMessage>()
    for (const x of messages) if (x.role === 'tool' && x.toolCallId) m.set(x.toolCallId, x)
    return m
  }, [messages])
  const visible = messages.filter((m) => m.role !== 'tool')
  const shown = visible.slice(-limit)
  const lastAssistantId = [...visible].reverse().find((m) => m.role === 'assistant')?.id

  return (
    <div className="h-full flex flex-col bg-app relative">
      <div className="h-10 shrink-0 px-5 flex items-center gap-2 text-[12.5px] text-fg2 border-b border-line/60">
        <span className="w-4 h-4 rounded-[4px] bg-bg3 border border-line grid place-items-center text-[9px] text-fg">{(project?.name ?? '·')[0]?.toUpperCase()}</span>
        <span className="truncate whitespace-nowrap max-w-[40%] shrink-0">{project?.name ?? t('noProject')}</span>
        <span className="text-fg3">/</span>
        <span className="text-fg font-medium truncate">{conv?.title ?? t('newChat')}</span>
        <TokenMeter messages={messages} />
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto" onScroll={(e) => { const el = e.currentTarget; setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80) }}>
        <div className="max-w-[780px] mx-auto px-6 pt-6 pb-40">
          {!convId || (messages.length === 0 && !live.running) ? <Empty /> : null}
          {conv?.runState === 'interrupted' && !live.running && (
            <div className="mb-4 card px-4 py-3 flex items-center gap-3 text-[13px]"><AlertCircle size={15} className="text-warn" /> {t('interrupted')}
              <button className="btn-outline h-7 ml-auto" onClick={() => actions.send('Continue the previous task from where it stopped. Check the current state of the files first.')}>{t('continue')}</button></div>
          )}
          {visible.length > limit && <button className="btn mx-auto mb-4 flex" onClick={() => setLimit(limit + PAGE)}>{t('Show earlier messages')} ({Math.min(PAGE, visible.length - limit)})</button>}
          {shown.map((m) => (
            <MessageRow key={m.id} m={m} results={results} toolOutput={live.toolOutput} running={live.running} isLastAssistant={m.id === lastAssistantId} />
          ))}
          {live.running && (
            <div className="msg mt-4">
              {live.reasoning && <Reasoning text={live.reasoning} live />}
              {live.text ? <div className="caret"><Markdown text={live.text} /></div> : !live.approvals.length && <div className="text-[13px] shimmer w-fit">{live.reasoning ? t('thinking') : t('working')}</div>}
            </div>
          )}
          {live.status && <div className="mt-3 text-[12.5px] text-fg2 border-l-2 border-warn pl-3">{live.status}</div>}
          {plan && <PlanCard />}
          {!live.running && live.lastEnd && ['cancelled', 'error', 'limit'].includes(live.lastEnd) && (
            <div className="mt-4 flex items-center gap-3 text-[13px] text-fg2">
              {live.lastEnd === 'limit' ? t('Step limit reached.') : live.lastEnd === 'error' ? t('Task failed.') : t('Task stopped.')}
              <button className="btn-outline h-7" onClick={() => actions.send('Continue the task from where you stopped. Check the current state of the files first.')}>{t('continue')}</button>
            </div>
          )}
        </div>
      </div>
      {!stick && <button className="absolute bottom-36 left-1/2 -translate-x-1/2 icon-btn bg-bg3 border border-line rounded-full w-8 h-8" aria-label="Scroll to bottom" onClick={() => setStick(true)}><ChevronDown size={15} /></button>}
      <div className="absolute bottom-0 inset-x-0 pointer-events-none bg-gradient-to-t from-bg/90 via-bg/70 to-transparent pt-8 pb-4 z-10">
        <div className="max-w-[780px] mx-auto px-6 pointer-events-auto">
          {/* Pending approvals sit in front of the conversation and plan, right above the composer. */}
          {live.approvals.length > 0 && (
            <div className="max-h-[55vh] overflow-y-auto mb-2 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
              {live.approvals.map((a) => <ApprovalCard key={a.id} req={a} />)}
            </div>
          )}
          <Composer />
        </div>
      </div>
    </div>
  )
}

function TokenMeter({ messages }: { messages: ChatMessage[] }) {
  const budget = useStore((s) => s.settings?.contextBudgetTokens ?? 0)
  const last = [...messages].reverse().find((m) => m.usage?.promptTokens)
  if (!last?.usage?.promptTokens) return null
  const used = last.usage.promptTokens + (last.usage.completionTokens ?? 0)
  const pct = Math.min(100, (used / budget) * 100)
  return (
    <span className="ml-auto flex items-center gap-2 text-2xs mono text-fg3" title={`Last request: ${last.usage.promptTokens} prompt + ${last.usage.completionTokens ?? 0} completion tokens (reported by the provider). Context budget: ${budget}.`}>
      <svg width="14" height="14" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="var(--line)" strokeWidth="2.5" /><circle cx="10" cy="10" r="8" fill="none" stroke="var(--fg2)" strokeWidth="2.5" strokeDasharray={`${(pct / 100) * 50.3} 50.3`} transform="rotate(-90 10 10)" /></svg>
      {used >= 1000 ? `${(used / 1000).toFixed(1)}k` : used}
    </span>
  )
}

/** The opening animation plays once per app launch, not every time the empty chat is shown again. */
let introPlayed = false

function Empty() {
  const t = useT()
  const [play] = useState(() => !introPlayed)
  useEffect(() => { introPlayed = true }, [])
  const up = (ms: number) => (play ? { className: 'intro-up', style: { ['--d' as string]: `${ms}ms` } } : {})
  const projectId = useStore((s) => s.projectId)
  const selected = useStore((s) => s.selected)
  const suggestions = projectId
    ? [t('Explain the structure of this project'), t('Find and fix the errors in this project'), t('Write tests for the main module')]
    : [t('Create a complete Snake game using Python'), t('Explain async/await in JavaScript'), t('Write a PowerShell script to rename photos by date')]
  return (
    <div className="pt-[8vh] pb-10">
      <IntroLogo animate={play} className="opacity-80 mb-10" />
      <h1 className="text-[44px] leading-[1.05] font-medium tracking-[-0.03em]" {...up(700)}>{t('emptyTitle')}</h1>
      <p className="mt-3 text-fg2 max-w-[460px]" {...up(850)}>{t('emptyHint')}</p>
      {!projectId && <div className={`mt-6 flex gap-2 ${play ? 'intro-up' : ''}`} style={play ? { ['--d' as string]: '1000ms' } : undefined}><button className="btn-primary" onClick={() => actions.openProjectDialog()}>{t('openProject')}</button><button className="btn-outline" onClick={() => actions.openProjectDialog(true)}>{t('newWorkspace')}</button></div>}
      {!selected && <p className="mt-4 text-[13px] text-warn">{t('No model selected — open the model menu below or Settings → Models.')}</p>}
      <div className="mt-10 flex flex-col gap-1 max-w-[520px]">
        {suggestions.map((s, i) => (
          <button key={s} {...up(1150 + i * 130)} className={`text-left py-2.5 border-b border-line text-[13.5px] text-fg2 hover:text-fg flex justify-between group ${play ? 'intro-up' : ''}`} onClick={() => actions.send(s)}>
            {s}<span className="mono text-fg3 group-hover:text-fg">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Reasoning({ text, live = false }: { text: string; live?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-2">
      <button className="flex items-center gap-1.5 text-[12.5px] text-fg2 hover:text-fg" onClick={() => setOpen(!open)}>
        <Brain size={13} strokeWidth={1.75} /> <span className={live ? 'shimmer' : ''}>{t('thinking')}</span> <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open && <div className="mt-1.5 pl-3 border-l border-line text-[12.5px] text-fg3 whitespace-pre-wrap selectable max-h-64 overflow-auto">{text}</div>}
    </div>
  )
}

function MessageRow({ m, results, toolOutput, running, isLastAssistant }: { m: ChatMessage; results: Map<string, ChatMessage>; toolOutput: Record<string, string>; running: boolean; isLastAssistant: boolean }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (m.role === 'user') {
    return (
      <div className="msg group flex flex-col items-end mt-6">
        {editing ? (
          <div className="w-full card p-2">
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full bg-transparent outline-none resize-none text-[14px] min-h-[80px] p-2" />
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setEditing(false)}>{t('cancel')}</button><button className="btn-primary h-8" disabled={running || !draft.trim()} onClick={() => { setEditing(false); actions.editAndResend(m.id, draft) }}>{t('send')}</button></div>
          </div>
        ) : (
          <div className="max-w-[85%] rounded-2xl bg-bg3 border border-line px-4 py-2.5 text-[14px] whitespace-pre-wrap selectable">{m.content}</div>
        )}
        {m.attachments?.length ? <div className="mt-1.5 flex flex-wrap gap-1 justify-end">{m.attachments.map((a) => <span key={a} className="text-2xs mono text-fg3 flex items-center gap-1"><Paperclip size={10} />{a}</span>)}</div> : null}
        {!editing && (
          <div className="mt-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button className="icon-btn" title={t('copy')} aria-label={t('copy')} onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
            <button className="icon-btn" title={t('edit')} aria-label={t('edit')} disabled={running} onClick={() => { setDraft(m.content); setEditing(true) }}><Pencil size={13} /></button>
          </div>
        )}
      </div>
    )
  }
  if (m.role !== 'assistant') return null
  return (
    <div className="msg group mt-4">
      {m.reasoning && <Reasoning text={m.reasoning} />}
      {m.content && <Markdown text={m.content} />}
      {m.toolCalls?.map((c) => <ToolCard key={c.id} call={c} result={results.get(c.id)} liveOutput={toolOutput[c.id]} running={running} />)}
      {m.error && (
        <div className="my-2 rounded-xl border border-del/40 bg-bg2 px-4 py-3 text-[13px] flex items-start gap-3">
          <AlertCircle size={15} className="text-del mt-0.5 shrink-0" />
          <div className="flex-1 selectable">{m.error}</div>
          <button className="btn-outline h-7 shrink-0" disabled={running} onClick={() => actions.regenerate()}><RotateCcw size={12} />{t('retry')}</button>
        </div>
      )}
      {(m.content || m.error) && !m.toolCalls?.length && (
        <div className="mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="icon-btn" title={t('copy')} aria-label={t('copy')} onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
          {isLastAssistant && <button className="icon-btn" title={t('regenerate')} aria-label={t('regenerate')} disabled={running} onClick={() => actions.regenerate()}><RotateCcw size={13} /></button>}
          {m.model && <span className="text-2xs text-fg3 mono ml-2">{m.model}{m.usage?.completionTokens ? ` · ${m.usage.completionTokens} tok` : ''}</span>}
        </div>
      )}
    </div>
  )
}

function PlanCard() {
  const t = useT()
  const convId = useStore((s) => s.convId)
  const plan = useStore((s) => (s.convId ? s.plans[s.convId] : undefined))
  const running = useLive(convId).running
  if (!plan) return null
  const done = plan.steps.filter((s) => s.status === 'done').length
  const Icon = { pending: Circle, in_progress: CircleDot, done: CircleCheck, skipped: CircleSlash }
  return (
    <div className="mt-5 rounded-xl border border-line bg-bg2 overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <span className="label">Plan</span>
        <span className="text-2xs mono text-fg3">{done}/{plan.steps.length}</span>
        <div className="flex-1 h-1 rounded-full bg-bg3 overflow-hidden"><div className="h-full grad-fill transition-all" style={{ width: `${(done / plan.steps.length) * 100}%` }} /></div>
        {plan.approved && <span className="text-2xs text-add">{t('approved')}</span>}
      </div>
      <div className="px-4 py-3 text-[13.5px] text-fg2 selectable"><Markdown text={plan.summary} /></div>
      <ol className="px-4 pb-3 space-y-1.5">
        {plan.steps.map((s, i) => {
          const I = Icon[s.status]
          return (
            <li key={i} className="flex gap-2.5 text-[13.5px]">
              <I size={15} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${s.status === 'done' ? 'text-add' : s.status === 'in_progress' ? 'text-fg animate-pulse' : 'text-fg3'}`} />
              <div><div className={s.status === 'done' ? 'text-fg2 line-through decoration-fg3' : ''}>{s.title}</div>{s.detail && <div className="text-[12.5px] text-fg3 mt-0.5">{s.detail}</div>}</div>
            </li>
          )
        })}
      </ol>
      {!plan.approved && (
        <div className="px-4 py-3 border-t border-line flex justify-end gap-2">
          <button className="btn-outline h-8" disabled={running} onClick={() => document.getElementById('composer')?.focus()}>{t('Request changes')}</button>
          <button className="btn-primary h-8" disabled={running} onClick={() => actions.approvePlan()}>{t('approve')}</button>
        </div>
      )}
    </div>
  )
}
