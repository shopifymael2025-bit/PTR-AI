import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, actions } from './lib/store'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { EditorPane } from './components/editor/EditorPane'
import { Explorer } from './components/editor/Explorer'
import { TerminalPanel } from './components/TerminalPanel'
import { Split } from './components/Split'
import { SettingsModal } from './components/settings/SettingsModal'
import { Onboarding } from './components/Onboarding'
import { CommandPalette, QuickOpen } from './components/Palette'
import { RightPanel } from './components/RightPanel'
import { matchShortcut } from './lib/shortcuts'
import { UpdateGate } from './components/Updates'
import { TermsGate } from './components/Terms'
import { TOS_VERSION } from '@shared/app'
import { ProjectPicker } from './components/ProjectPicker'
import { PromptModal } from './components/PromptModal'
import { ConfirmModal } from './components/ConfirmModal'

export function App() {
  const ready = useStore((s) => s.ready)
  const layout = useStore((s) => s.layout)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const modal = useStore((s) => s.modal)
  const rightPanel = useStore((s) => s.rightPanel)
  const projectId = useStore((s) => s.projectId)
  const tosAccepted = useStore((s) => s.settings?.tosAcceptedVersion === TOS_VERSION)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState().settings
      const sc = st?.shortcuts
      if (!sc || st?.tosAcceptedVersion !== TOS_VERSION) return
      const hit = (k: string) => sc[k] && matchShortcut(e, sc[k])
      if (hit('commandPalette')) { e.preventDefault(); useStore.setState({ modal: 'palette' }) }
      else if (hit('quickOpen')) { e.preventDefault(); if (useStore.getState().projectId) useStore.setState({ modal: 'quickOpen' }) }
      else if (hit('openProject')) { e.preventDefault(); actions.openProjectDialog() }
      else if (hit('newSession')) { e.preventDefault(); actions.newConversation() }
      else if (hit('focusChat')) { e.preventDefault(); document.getElementById('composer')?.focus() }
      else if (hit('toggleSidebar')) { e.preventDefault(); useStore.setState((s) => ({ sidebarOpen: !s.sidebarOpen })) }
      else if (e.key === 'Escape' && useStore.getState().modal === 'projectPicker') actions.resolveProjectPicker(null)
      else if (e.key === 'Escape' && useStore.getState().modal && useStore.getState().modal !== 'onboarding') useStore.setState({ modal: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return <div className="h-full bg-app" />
  // Nothing else is mounted until the Terms of Service are accepted.
  if (!tosAccepted) return <TermsGate />

  const chat = <ChatView />
  const editorAndTerminal = (
    <Split id="editor-terminal" direction="vertical" initial={240} min={100} secondary>
      <EditorPane />
      <TerminalPanel />
    </Split>
  )
  let main: React.ReactNode = chat
  if (layout === 'code') main = <Split id="chat-editor" initial={520} min={360}>{chat}<EditorPane /></Split>
  if (layout === 'workspace') {
    main = projectId ? (
      <Split id="explorer" initial={240} min={160}>
        <Explorer />
        <Split id="ws-chat" initial={440} min={220} secondary>{editorAndTerminal}{chat}</Split>
      </Split>
    ) : <Split id="ws-chat" initial={440} min={220} secondary>{editorAndTerminal}{chat}</Split>
  }

  return (
    <div className="h-full flex flex-col bg-app text-fg">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div key="sb" initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="shrink-0 overflow-hidden border-r border-line">
              <Sidebar />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex-1 min-w-0 flex">
          <div className="flex-1 min-w-0">{main}</div>
          {rightPanel && <div className="w-[380px] shrink-0 border-l border-line bg-bg2"><RightPanel /></div>}
        </div>
      </div>
      {modal === 'settings' && <SettingsModal />}
      {modal === 'onboarding' && <Onboarding />}
      {modal === 'palette' && <CommandPalette />}
      {modal === 'quickOpen' && <QuickOpen />}
      {modal === 'projectPicker' && <ProjectPicker />}
      <PromptModal />
      <ConfirmModal />
      <Toasts />
      <UpdateGate />
    </div>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[420px]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status"
            className={`selectable rounded-xl border px-4 py-3 text-[13px] bg-bg3 shadow-lg ${t.kind === 'error' ? 'border-del/50 text-fg' : 'border-line text-fg'}`}>
            {t.kind === 'error' && <span className="text-del font-medium mr-1">Error</span>}{t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
