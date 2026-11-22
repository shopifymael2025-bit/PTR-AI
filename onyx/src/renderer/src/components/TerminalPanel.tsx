import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Plus, X, TerminalSquare } from 'lucide-react'
import { useStore, toast } from '../lib/store'
import { invoke, on } from '../lib/api'
import { useT } from '../lib/i18n'

interface Tab { id: string; title: string; exited?: number }

function themeColors() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return { background: '#00000000', foreground: v('--fg'), cursor: v('--accent'), selectionBackground: '#3b82f655', black: '#1e1e1e', brightBlack: '#6074ad' }
}

function TermView({ tab, visible }: { tab: Tab; visible: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const settings = useStore((s) => s.settings!)
  useEffect(() => {
    const term = new XTerm({ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: settings.terminal.fontSize, cursorStyle: settings.terminal.cursorStyle, cursorBlink: true, allowTransparency: true, theme: themeColors(), allowProposedApi: false, scrollback: 5000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el.current!)
    // Copy with Ctrl+Shift+C / selection + Ctrl+C, paste with Ctrl+V.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); return false }
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) { navigator.clipboard.readText().then((t) => invoke('term:write', { id: tab.id, data: t })); return false }
      return true
    })
    const offData = on<{ id: string; data: string }>('term:data', (p) => { if (p.id === tab.id) term.write(p.data) })
    const offExit = on<{ id: string; code: number }>('term:exit', (p) => { if (p.id === tab.id) term.write(`\r\n\x1b[90m[process exited with code ${p.code}]\x1b[0m\r\n`) })
    const sub = term.onData((d) => invoke('term:write', { id: tab.id, data: d }))
    const ro = new ResizeObserver(() => { try { fit.fit(); invoke('term:resize', { id: tab.id, cols: term.cols, rows: term.rows }) } catch { /* hidden */ } })
    ro.observe(el.current!)
    return () => { ro.disconnect(); sub.dispose(); offData(); offExit(); term.dispose() }
  }, [tab.id])
  return <div ref={el} className={`absolute inset-0 ${visible ? '' : 'invisible'}`} />
}

export function TerminalPanel() {
  const t = useT()
  const projectId = useStore((s) => s.projectId)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  void t

  const create = async (): Promise<string | null> => {
    try {
      const id = await invoke<string>('term:create', { projectId, cols: 100, rows: 24 })
      setTabs((ts) => [...ts, { id, title: `${useStore.getState().settings?.terminal.shell.replace('.exe', '')} ${ts.length + 1}` }])
      setActive(id)
      return id
    } catch (e) { toast((e as Error).message, 'error'); return null }
  }

  // Commands queued by "Run" buttons are typed into the active terminal (one is created if needed).
  const queue = useStore((s) => s.termQueue)
  const activeRef = useRef<string | null>(null)
  const queueCreating = useRef(false)
  activeRef.current = active
  useEffect(() => {
    if (!queue.length) return
    const items = queue
    useStore.setState({ termQueue: [] })
    ;(async () => {
      let target = activeRef.current
      if (!target) { queueCreating.current = true; target = await create(); if (!target) return; await new Promise((r) => setTimeout(r, 900)) }
      for (const it of items) await invoke('term:write', { id: target, data: it.cmd + '\r' })
    })()
  }, [queue])
  const close = (id: string) => {
    invoke('term:kill', id)
    setTabs((ts) => { const n = ts.filter((x) => x.id !== id); if (active === id) setActive(n[n.length - 1]?.id ?? null); return n })
  }

  useEffect(() => {
    setTabs((ts) => { ts.forEach((x) => invoke('term:kill', x.id)); return [] })
    setActive(null)
    if (queueCreating.current) { queueCreating.current = false; return }
    create()
  }, [projectId])

  return (
    <div className="h-full flex flex-col bg-app">
      <div className="h-8 shrink-0 flex items-center gap-1 px-2 border-b border-line">
        <TerminalSquare size={13} className="text-fg3 mr-1" />
        {tabs.map((tb) => (
          <div key={tb.id} onClick={() => setActive(tb.id)} className={`group h-6 pl-2 pr-1 rounded flex items-center gap-1 text-[12px] cursor-default ${tb.id === active ? 'bg-bg3 text-fg' : 'text-fg3 hover:text-fg2'}`}>
            <span className="mono">{tb.title}</span>
            <button className="w-4 h-4 grid place-items-center opacity-0 group-hover:opacity-100" aria-label="Kill terminal" onClick={(e) => { e.stopPropagation(); close(tb.id) }}><X size={11} /></button>
          </div>
        ))}
        <button className="icon-btn w-6 h-6" title={t('newTerminal')} aria-label={t('newTerminal')} onClick={() => create()}><Plus size={13} /></button>
      </div>
      <div className="flex-1 relative min-h-0">
        {tabs.map((tb) => <TermView key={tb.id} tab={tb} visible={tb.id === active} />)}
      </div>
    </div>
  )
}
