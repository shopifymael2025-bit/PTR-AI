import { useEffect, useRef } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { X, Map as MapIcon, WrapText, Save, Check, ChevronRight, Code2, Play, Eye } from 'lucide-react'
import { canRunFile, commandForFile, isPreviewable, runFile } from '../../lib/run'
import { useT } from '../../lib/i18n'
import { shortcutLabel } from '../../lib/shortcuts'
import { languageOf } from './monaco'
import { useStore, actions, toast } from '../../lib/store'
import { invoke } from '../../lib/api'

export function EditorPane() {
  const t = useT()
  const files = useStore((s) => s.files)
  const activePath = useStore((s) => s.activeFile)
  const diff = useStore((s) => s.diff)
  const settings = useStore((s) => s.settings)!
  const projectId = useStore((s) => s.projectId)
  const theme = document.documentElement.dataset.theme === 'light' ? 'ptrai-light' : 'ptrai-dark'
  const active = files.find((f) => f.path === activePath)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!settings.editor.autoSave || !active || active.content === active.saved || active.binary) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => actions.saveFile(active.path), 1000)
    return () => clearTimeout(saveTimer.current)
  }, [active?.content, settings.editor.autoSave])

  const opts = {
    fontFamily: `'${settings.editor.fontFamily}', 'JetBrains Mono', Consolas, monospace`, fontSize: settings.editor.fontSize, tabSize: settings.editor.tabSize,
    wordWrap: settings.editor.wordWrap ? 'on' : 'off', minimap: { enabled: settings.editor.minimap }, smoothScrolling: true, scrollBeyondLastLine: false,
    renderLineHighlight: 'line', padding: { top: 10 }, automaticLayout: true, fontLigatures: true, bracketPairColorization: { enabled: true }
  } as const

  const setEd = (patch: Partial<typeof settings.editor>) => actions.updateSettings({ editor: { ...settings.editor, ...patch } })

  if (diff) {
    const acceptDiff = async () => {
      if (!projectId) return
      try { await invoke('fs:write', { projectId, path: diff.path, content: diff.after }); toast(`${t('Applied to')} ${diff.path}`); useStore.setState({ diff: null }); actions.reloadFile(diff.path); actions.openFile(diff.path) }
      catch (e) { toast((e as Error).message, 'error') }
    }
    return (
      <div className="h-full flex flex-col bg-app">
        <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-line text-[12.5px]">
          <span className="label">Diff</span><span className="mono text-fg2 truncate">{diff.path}</span>
          <div className="ml-auto flex gap-1.5">
            <button className="btn h-7" onClick={() => useStore.setState({ diff: null })}>{t('close')}</button>
            <button className="btn-primary h-7" onClick={acceptDiff}><Check size={13} />{t('Accept & write')}</button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <DiffEditor original={diff.before} modified={diff.after} language={languageOf(diff.path)} theme={theme} options={{ ...opts, renderSideBySide: true, readOnly: false, originalEditable: false }}
            onMount={(ed) => { ed.getModifiedEditor().onDidChangeModelContent(() => useStore.setState((s) => (s.diff ? { diff: { ...s.diff, after: ed.getModifiedEditor().getValue() } } : {}))) }} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-app">
      <div className="h-9 shrink-0 flex items-stretch border-b border-line overflow-x-auto">
        {files.map((f) => {
          const dirty = f.content !== f.saved && !f.binary
          return (
            <div key={f.path} onClick={() => useStore.setState({ activeFile: f.path, diff: null })} onAuxClick={(e) => { if (e.button === 1) actions.closeFile(f.path) }}
              className={`group shrink-0 flex items-center gap-2 pl-3 pr-1.5 text-[12.5px] border-r border-line cursor-default ${f.path === activePath ? 'bg-bg2 text-fg' : 'text-fg3 hover:text-fg2'}`} title={f.path}>
              <span className="truncate max-w-[180px]">{f.path.split('/').pop()}</span>
              <button className="w-5 h-5 grid place-items-center rounded hover:bg-bg3" aria-label={`Close ${f.path}`} onClick={(e) => { e.stopPropagation(); actions.closeFile(f.path) }}>
                {dirty ? <span className="w-2 h-2 rounded-full bg-fg2 group-hover:hidden" /> : null}<X size={12} className={dirty ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'} />
              </button>
            </div>
          )
        })}
        <div className="flex-1" />
        {active && (
          <div className="flex items-center gap-0.5 px-2">
            {canRunFile(active.path) && (
              <button className="btn h-7 px-2 text-[12px] text-fg" title={isPreviewable(active.path) ? t('Preview') : `${t('Run file')} — ${commandForFile(active.path)}`} onClick={() => runFile(active.path)}>
                {isPreviewable(active.path) ? <Eye size={13} /> : <Play size={13} />}{isPreviewable(active.path) ? t('Preview') : t('Run')}
              </button>
            )}
            <button className={`icon-btn ${settings.editor.minimap ? 'text-fg' : ''}`} title={t('Toggle minimap')} aria-label={t('Toggle minimap')} onClick={() => setEd({ minimap: !settings.editor.minimap })}><MapIcon size={13} /></button>
            <button className={`icon-btn ${settings.editor.wordWrap ? 'text-fg' : ''}`} title={t('Toggle word wrap')} aria-label={t('Toggle word wrap')} onClick={() => setEd({ wordWrap: !settings.editor.wordWrap })}><WrapText size={13} /></button>
            <button className="icon-btn" title={`Save (${shortcutLabel('Ctrl+S')})`} aria-label="Save" disabled={active.content === active.saved || active.binary} onClick={() => actions.saveFile(active.path)}><Save size={13} /></button>
          </div>
        )}
      </div>
      {active && (
        <div className="h-7 shrink-0 px-3 flex items-center gap-1 text-2xs text-fg3 mono border-b border-line/60">
          {active.path.split('/').map((seg, i, arr) => <span key={i} className="flex items-center gap-1">{seg}{i < arr.length - 1 && <ChevronRight size={10} />}</span>)}
          <span className="ml-auto">{languageOf(active.path)}</span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {active ? (
          active.binary && active.saved !== '\u0000' ? <div className="p-8 text-fg3 text-[13px]">{t('Binary file — not shown.')}</div> : (
            <Editor
              path={active.path} value={active.content} language={languageOf(active.path)} theme={theme}
              options={{ ...opts, readOnly: active.binary }}
              onChange={(v) => actions.updateFile(active.path, v ?? '')}
              onMount={(ed, m) => { editorRef.current = ed; ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => { const p = useStore.getState().activeFile; if (p) actions.saveFile(p) }) }}
            />
          )
        ) : (
          <div className="h-full grid place-items-center text-fg3 text-[13px]">
            <div className="text-center"><Code2 size={28} strokeWidth={1.25} className="mx-auto mb-3" />{t('Open a file from the explorer or press')} <span className="mono">{shortcutLabel('Ctrl+P')}</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
