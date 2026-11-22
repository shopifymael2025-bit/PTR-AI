import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'
import { actions } from './lib/store'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('PTR AI UI error:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="h-full grid place-items-center bg-bg text-fg p-10">
        <div className="max-w-[560px]">
          <div className="label mb-2">Interface error</div>
          <pre className="mono text-[12px] text-del whitespace-pre-wrap selectable">{this.state.error.message}</pre>
          <p className="text-fg2 text-[13px] mt-3">Your conversations and files are safe. Reload the interface to continue.</p>
          <button className="btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
actions.init().catch((e) => {
  document.getElementById('root')!.innerHTML = `<div style="padding:40px;font-family:monospace;color:#f85149">PTR AI failed to start: ${String(e?.message ?? e).replace(/</g, '&lt;')}</div>`
})
