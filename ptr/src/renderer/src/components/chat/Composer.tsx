import { useEffect, useRef, useState } from 'react'
import { Plus, ArrowUp, Square, X, FileText, Folder, FolderTree, Paperclip, Mic } from 'lucide-react'
import type { AgentMode } from '@shared/types'
import { useStore, actions, useLive, toast } from '../../lib/store'
import { invoke } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { ModelPicker } from './ModelPicker'
import '../../voice.css'

const SLASH: { cmd: string; desc: string; run: () => void }[] = [
  { cmd: '/new', desc: 'Start a new session', run: () => actions.newConversation() },
  { cmd: '/ask', desc: 'Switch to Ask mode (read-only)', run: () => actions.setMode('ask') },
  { cmd: '/build', desc: 'Switch to Build mode', run: () => actions.setMode('build') },
  { cmd: '/plan', desc: 'Switch to Plan mode', run: () => actions.setMode('plan') },
  { cmd: '/settings', desc: 'Open settings', run: () => useStore.setState({ modal: 'settings' }) },
  { cmd: '/models', desc: 'Manage models', run: () => useStore.setState({ modal: 'settings', settingsSection: 'models' }) }
]

/** Speech recognition constructor (Chromium exposes it with the webkit prefix). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSpeechRecognition = (): (new () => any) | null => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/** The composer rises into place once per app launch, right after the home screen animation. */
let composerIntroPlayed = false

export function Composer() {
  const t = useT()
  const [intro] = useState(() => !composerIntroPlayed)
  useEffect(() => { composerIntroPlayed = true }, [])
  const [sent, setSent] = useState(false)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [menu, setMenu] = useState<null | 'plus' | 'mode'>(null)
  const [at, setAt] = useState<{ q: string; results: string[]; idx: number } | null>(null)
  const [listening, setListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const convId = useStore((s) => s.convId)
  const projectId = useStore((s) => s.projectId)
  const mode = useStore((s) => s.mode)
  const running = useLive(convId).running

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 280) + 'px'
  }, [text])

  // "@" file mention search (debounced)
  useEffect(() => {
    const m = /(^|\s)@([^\s@]*)$/.exec(text)
    if (!m || !projectId) { setAt(null); return }
    const q = m[2]
    const h = setTimeout(async () => {
      const results = await invoke<string[]>('fs:searchFiles', { projectId, query: q }).catch(() => [])
      setAt({ q, results: results.slice(0, 8), idx: 0 })
    }, 120)
    return () => clearTimeout(h)
  }, [text, projectId])

  // stop the microphone if the composer goes away
  useEffect(() => () => { recRef.current?.abort() }, [])

  const stopVoice = () => { recRef.current?.stop() }

  /** Dictation: speech is written into the message box live, the person reviews it and presses send. */
  const startVoice = () => {
    const SR = getSpeechRecognition()
    if (!SR) return toast('Voice input is not available on this system.', 'error')
    const rec = new SR()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    const base = text.trim() ? text.replace(/\s+$/, '') + ' ' : ''
    let finalText = ''
    rec.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      setText(base + finalText + interim)
    }
    rec.onerror = (e: { error: string }) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Microphone access was denied. Allow it in Windows Settings > Privacy > Microphone.', 'error')
      else if (e.error === 'audio-capture') toast('No microphone found.', 'error')
      else if (e.error === 'network') toast('Speech recognition needs an online service that is not available in this build.', 'error')
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(`Voice input error: ${e.error}`, 'error')
    }
    rec.onend = () => { setListening(false); if (recRef.current === rec) recRef.current = null }
    recRef.current = rec
    try { rec.start(); setListening(true); ref.current?.focus() } catch { recRef.current = null; setListening(false) }
  }

  const slash = text.startsWith('/') && !text.includes(' ') ? SLASH.filter((s) => s.cmd.startsWith(text)) : []

  const pickMention = (p: string) => {
    setText(text.replace(/@([^\s@]*)$/, ''))
    setAttachments((a) => (a.includes(p) ? a : [...a, p]))
    setAt(null)
    ref.current?.focus()
  }

  const submit = () => {
    const v = text.trim()
    if (!v || running) return
    recRef.current?.abort()
    const sc = SLASH.find((s) => s.cmd === v)
    if (sc) { sc.run(); setText(''); return }
    actions.send(v, attachments)
    setText(''); setAttachments([])
    setSent(true); setTimeout(() => setSent(false), 600)
  }

  const attach = async (folder: boolean) => {
    setMenu(null)
    if (!projectId) return toast('Open a project first to attach files.', 'error')
    const r = await invoke<string[]>('fs:pickAttachment', { projectId, folder }).catch((e) => { toast((e as Error).message, 'error'); return [] })
    setAttachments((a) => [...new Set([...a, ...r])])
  }

  const modes: { id: AgentMode; label: string; desc: string }[] = [
    { id: 'ask', label: t('ask'), desc: t('askDesc') },
    { id: 'build', label: t('build'), desc: t('buildDesc') },
    { id: 'plan', label: t('plan'), desc: t('planDesc') }
  ]

  return (
    <div data-busy={running} className={`composer relative rounded-2xl border border-line bg-bg2 shadow-[0_8px_30px_rgba(0,0,0,0.25)] focus-within:border-fg3 ${intro ? 'composer-in' : ''}`}>
      {(slash.length > 0 || (at && at.results.length > 0)) && (
        <div className="pop-in absolute bottom-full mb-2 left-0 w-[380px] card p-1 shadow-xl z-20">
          {slash.map((s) => <button key={s.cmd} className="btn w-full justify-start h-8" onClick={() => { s.run(); setText('') }}><span className="mono text-fg">{s.cmd}</span><span className="text-fg3">{t(s.desc)}</span></button>)}
          {at?.results.map((r, i) => <button key={r} className={`btn w-full justify-start h-7 mono text-[12px] ${i === at.idx ? 'bg-bg3 text-fg' : ''}`} onClick={() => pickMention(r)}><FileText size={12} />{r}</button>)}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {attachments.map((a) => (
            <span key={a} className="chip-in h-6 pl-2 pr-1 rounded-md bg-bg3 border border-line text-2xs mono flex items-center gap-1 text-fg2">
              <Paperclip size={10} />{a}<button className="w-4 h-4 grid place-items-center hover:text-fg" aria-label={`Remove ${a}`} onClick={() => setAttachments(attachments.filter((x) => x !== a))}><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <textarea
        id="composer" ref={ref} rows={1} value={text} onChange={(e) => { if (listening) stopVoice(); setText(e.target.value) }}
        placeholder={t('composerPlaceholder')} aria-label="Message"
        className="w-full bg-transparent resize-none outline-none px-4 pt-3.5 pb-1 text-[14px] leading-[1.55] placeholder:text-fg3 max-h-[280px]"
        onKeyDown={(e) => {
          if (at && at.results.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAt({ ...at, idx: (at.idx + 1) % at.results.length }); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setAt({ ...at, idx: (at.idx - 1 + at.results.length) % at.results.length }); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(at.results[at.idx]); return }
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
        }}
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <div className="relative">
          <button className="icon-btn plus-btn" aria-label="Attach" aria-expanded={menu === 'plus'} title="Attach context" onClick={() => setMenu(menu === 'plus' ? null : 'plus')}><Plus size={16} strokeWidth={1.75} /></button>
          {menu === 'plus' && (
            <><div className="fixed inset-0 z-20" onClick={() => setMenu(null)} /><div className="pop-in absolute bottom-9 left-0 w-56 card p-1 shadow-xl z-30">
              <button className="btn w-full justify-start" onClick={() => attach(false)}><FileText size={14} />{t('Attach file…')}</button>
              <button className="btn w-full justify-start" onClick={() => attach(true)}><Folder size={14} />{t('Attach folder…')}</button>
              <button className="btn w-full justify-start" disabled={!projectId} onClick={() => { setMenu(null); setAttachments((a) => [...new Set([...a, '.'])]) }}><FolderTree size={14} />{t('Workspace overview')}</button>
            </div></>
          )}
        </div>
        <ModelPicker />
        <div className="relative">
          <button className="btn h-7 px-2 text-[12.5px]" onClick={() => setMenu(menu === 'mode' ? null : 'mode')} aria-label="Agent mode">{modes.find((m) => m.id === mode)?.label}</button>
          {menu === 'mode' && (
            <><div className="fixed inset-0 z-20" onClick={() => setMenu(null)} /><div className="pop-in absolute bottom-9 left-0 w-72 card p-1 shadow-xl z-30" role="menu">
              {modes.map((m) => (
                <button key={m.id} role="menuitem" onClick={() => { actions.setMode(m.id); setMenu(null) }} className={`w-full text-left rounded-lg px-3 py-2 hover:bg-bg3 ${mode === m.id ? 'bg-bg3' : ''}`}>
                  <div className="text-[13px] text-fg">{m.label}</div><div className="text-2xs text-fg3">{m.desc}</div>
                </button>
              ))}
            </div></>
          )}
        </div>
        <div className="flex-1" />
        {!running && (
          <button
            className={`mic-btn w-8 h-8 rounded-full grid place-items-center ${listening ? 'mic-on' : ''}`}
            aria-label={listening ? 'Stop dictation' : 'Dictate a message'} aria-pressed={listening}
            title={listening ? 'Stop dictation' : 'Dictate a message'}
            onClick={listening ? stopVoice : startVoice}
          >
            {listening ? <span className="mic-bars" aria-hidden="true"><i /><i /><i /></span> : <Mic size={16} strokeWidth={1.75} />}
          </button>
        )}
        {running
          ? <button className="stop-btn w-8 h-8 rounded-full bg-fg text-bg grid place-items-center" aria-label={t('stop')} title={t('stop')} onClick={() => actions.stop()}><Square size={11} fill="currentColor" /></button>
          : <button className="send-btn w-8 h-8 rounded-full bg-accent text-accent-fg grid place-items-center disabled:opacity-30" aria-label={t('send')} title={`${t('send')} (Enter)`} disabled={!text.trim()} onClick={submit}><ArrowUp size={16} strokeWidth={2} className={sent ? 'arrow-fly' : ''} /></button>}
      </div>
    </div>
  )
}
