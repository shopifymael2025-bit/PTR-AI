import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

// Bundle Monaco locally (no CDN) and wire its web workers.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}
loader.config({ monaco })

monaco.editor.defineTheme('ptrai-dark', {
  base: 'vs-dark', inherit: true, rules: [{ token: 'comment', foreground: '6074ad', fontStyle: 'italic' }],
  colors: { 'editor.background': '#0a123300', 'editor.lineHighlightBackground': '#3b82f614', 'editorLineNumber.foreground': '#41508a', 'editorLineNumber.activeForeground': '#9db0e0', 'editorGutter.background': '#0a123300', 'editorWidget.background': '#101a45', 'editorWidget.border': '#25326d', 'minimap.background': '#0a123300', 'editor.selectionBackground': '#2a4a9a88', 'scrollbarSlider.background': '#25326d80', 'diffEditor.insertedTextBackground': '#3fb95022', 'diffEditor.removedTextBackground': '#f8514922' }
})
monaco.editor.defineTheme('ptrai-light', {
  base: 'vs', inherit: true, rules: [{ token: 'comment', foreground: '999999', fontStyle: 'italic' }],
  colors: { 'editor.background': '#f4f7ff00', 'editor.lineHighlightBackground': '#1d4ed810', 'editorLineNumber.foreground': '#a5b0d4', 'editorGutter.background': '#f4f7ff00', 'minimap.background': '#f4f7ff00' }
})

const EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyw: 'python', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', json: 'json', jsonc: 'json',
  cs: 'csharp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'cpp', c: 'c', java: 'java', lua: 'lua', luau: 'lua', rs: 'rust', go: 'go',
  md: 'markdown', markdown: 'markdown', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', sh: 'shell', ps1: 'powershell', psm1: 'powershell',
  sql: 'sql', php: 'php', rb: 'ruby', kt: 'kotlin', swift: 'swift', dart: 'dart', toml: 'ini', ini: 'ini', bat: 'bat', cmd: 'bat', dockerfile: 'dockerfile', vue: 'html'
}
export function languageOf(path: string): string {
  const name = path.split('/').pop()!.toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  return EXT[name.split('.').pop() ?? ''] ?? 'plaintext'
}
export { monaco }
