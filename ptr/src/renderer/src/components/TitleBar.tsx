import { useEffect, useState } from 'react'
import { PanelLeft, Search, Plus, X, Minus, Square, Copy, MessageSquare, Code2, LayoutDashboard, GitBranch, FileDiff, Loader2 } from 'lucide-react'
import { useStore, actions } from '../lib/store'
import { invoke, on } from '../lib/api'
import { useT } from '../lib/i18n'
import { IS_MAC, shortcutLabel } from '../lib/shortcuts'
import { Logo } from './Logo'
import type { LayoutMode } from '@shared/types'

export function TitleBar() {
  const t = useT()
  const [max, setMax] = useState(false)
  const tabs = useStore((s) => s.tabs)
  const convId = useStore((s) => s.convId)
  const convs = useStore((s) => s.conversations)
  const live = useStore((s) => s.live)
  const layout = useStore((s) => s.layout)
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId))
  const rightPanel = useStore((s) => s.rightPanel)

  useEffect(() => { invoke<boolean>('window:isMaximized').then(setMax); return on<boolean>('window:maximized', setMax) }, [])

  const layouts: { id: LayoutMode; icon: typeof MessageSquare; label: string }[] = [
    { id: 'chat', icon: MessageSquare, label: t('chat') },
    { id: 'code', icon: Code2, label: t('code') },
    { id: 'workspace', icon: LayoutDashboard, label: t('workspace') }
  ]

  return (
    <div className={`drag h-11 shrink-0 flex items-center gap-1 ${IS_MAC ? 'pl-[80px]' : 'pl-3'} border-b border-line bg-app select-none`} onDoubleClick={(e) => { if (e.target === e.currentTarget) invoke('window:maximize') }}>
      <Logo size={11} className="mr-3 text-fg" />
      <div className="no-drag flex items-center gap-0.5">
        <button className="icon-btn" title={`Toggle sidebar (${shortcutLabel(useStore.getState().settings?.shortcuts.toggleSidebar ?? '')})`} aria-label="Toggle sidebar" onClick={() => useStore.setState((s) => ({ sidebarOpen: !s.sidebarOpen }))}><PanelLeft size={15} strokeWidth={1.75} /></button>
        <button className="icon-btn" title={`Command palette (${shortcutLabel('Ctrl+Shift+P')})`} aria-label="Search" onClick={() => useStore.setState({ modal: 'palette' })}><Search size={15} strokeWidth={1.75} /></button>
      </div>
      {project && <div className="mx-2 text-[12px] text-fg2 truncate max-w-[160px] mono" title={project.path}>{project.name}</div>}
      <div className="no-drag flex items-center gap-1 min-w-0 overflow-x-auto">
        {tabs.map((id) => {
          const c = convs.find((x) => x.id === id)
          const active = id === convId
          return (
            <div key={id} onClick={() => actions.openConversation(id)} onAuxClick={(e) => { if (e.button === 1) actions.closeTab(id) }}
              className={`group h-7 pl-2.5 pr-1 flex items-center gap-1.5 rounded-md text-[12.5px] cursor-default max-w-[200px] ${active ? 'bg-bg3 text-fg' : 'text-fg2 hover:bg-bg2'}`}>
              {live[id]?.running ? <Loader2 size={12} className="animate-spin shrink-0" /> : <span className="w-3.5 h-3.5 rounded-[3px] bg-fg3/40 text-[9px] grid place-items-center text-fg shrink-0">{(c?.title ?? 'S')[0].toUpperCase()}</span>}
              <span className="truncate">{c?.title ?? 'Session'}</span>
              <button className="opacity-0 group-hover:opacity-100 w-5 h-5 grid place-items-center rounded hover:bg-bg2" aria-label="Close tab" onClick={(e) => { e.stopPropagation(); actions.closeTab(id) }}><X size={12} /></button>
            </div>
          )
        })}
        <button className="icon-btn" title={`${t('newChat')} (${shortcutLabel('Ctrl+N')})`} aria-label={t('newChat')} onClick={() => actions.newConversation()}><Plus size={15} strokeWidth={1.75} /></button>
      </div>
      <div className="flex-1 h-full" />
      <div className="no-drag flex items-center gap-0.5 mr-2 p-0.5 rounded-lg bg-bg2 border border-line">
        {layouts.map((l) => (
          <button key={l.id} title={l.label} aria-label={l.label} aria-pressed={layout === l.id} onClick={() => actions.setLayout(l.id)}
            className={`h-6 px-2 rounded-md flex items-center gap-1.5 text-[12px] ${layout === l.id ? 'bg-bg3 text-fg' : 'text-fg3 hover:text-fg'}`}>
            <l.icon size={13} strokeWidth={1.75} /><span className="hidden lg:inline">{l.label}</span>
          </button>
        ))}
      </div>
      {project && (
        <div className="no-drag flex items-center gap-0.5 mr-1">
          <button className={`icon-btn ${rightPanel === 'changes' ? 'bg-bg3 text-fg' : ''}`} title={t('changes')} aria-label={t('changes')} onClick={() => useStore.setState({ rightPanel: rightPanel === 'changes' ? null : 'changes' })}><FileDiff size={15} strokeWidth={1.75} /></button>
          <button className={`icon-btn ${rightPanel === 'git' ? 'bg-bg3 text-fg' : ''}`} title={t('git')} aria-label={t('git')} onClick={() => useStore.setState({ rightPanel: rightPanel === 'git' ? null : 'git' })}><GitBranch size={15} strokeWidth={1.75} /></button>
        </div>
      )}
      {!IS_MAC && <div className="no-drag flex h-full">
        <button className="w-11 h-full grid place-items-center text-fg2 hover:bg-bg3" aria-label="Minimize" onClick={() => invoke('window:minimize')}><Minus size={15} strokeWidth={1.5} /></button>
        <button className="w-11 h-full grid place-items-center text-fg2 hover:bg-bg3" aria-label={max ? 'Restore' : 'Maximize'} onClick={() => invoke('window:maximize')}>{max ? <Copy size={12} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={12} strokeWidth={1.5} />}</button>
        <button className="w-11 h-full grid place-items-center text-fg2 hover:bg-[#e81123] hover:text-white" aria-label="Close" onClick={() => invoke('window:close')}><X size={16} strokeWidth={1.5} /></button>
      </div>}
      {IS_MAC && <div className="w-3" />}
    </div>
  )
}
