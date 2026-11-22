// "Run inside PTR AI": maps files and code snippets to a command typed into the integrated terminal,
// or to an isolated preview window for HTML. Everything here is triggered by an explicit user click.
// Windows terminals run PowerShell; macOS terminals run zsh/bash, so commands differ per platform.
import { actions, toast, useStore } from './store'
import { invoke } from './api'
import { IS_MAC } from './shortcuts'

/** Quote a path for the platform shell. */
export function quote(p: string, mac = IS_MAC): string {
  return mac ? `'${p.replace(/'/g, `'\\''`)}'` : `"${p.replace(/"/g, '`"')}"`
}

/** Shell command that runs a project file, or null if PTR AI doesn't know how. */
export function commandForFile(rel: string, mac = IS_MAC): string | null {
  const p = quote(rel, mac)
  const ext = rel.split('.').pop()?.toLowerCase() ?? ''
  const name = rel.split('/').pop()?.toLowerCase() ?? ''
  const py = mac ? 'python3' : 'python'
  const compileAndRun = (cc: string) => (mac ? `${cc} ${p} -o ptrai_out && ./ptrai_out` : `${cc} ${p} -o ptrai_out.exe; if ($?) { .\\ptrai_out.exe }`)
  if (name === 'package.json') return 'npm start'
  switch (ext) {
    case 'py': case 'pyw': return `${py} ${p}`
    case 'js': case 'mjs': case 'cjs': return `node ${p}`
    case 'ts': return `npx --yes tsx ${p}`
    case 'sh': case 'zsh': return mac ? `sh ${p}` : null
    case 'ps1': return mac ? `pwsh -File ${p}` : `powershell -ExecutionPolicy Bypass -File ${p}`
    case 'bat': case 'cmd': return mac ? null : `cmd /c ${p}`
    case 'swift': return mac ? `swift ${p}` : null
    case 'go': return `go run ${p}`
    case 'rs': return 'cargo run'
    case 'java': return `java ${p}`
    case 'lua': case 'luau': return `lua ${p}`
    case 'rb': return `ruby ${p}`
    case 'php': return `php ${p}`
    case 'cs': return 'dotnet run'
    case 'c': return compileAndRun(mac ? 'clang' : 'gcc')
    case 'cpp': case 'cc': case 'cxx': return compileAndRun(mac ? 'clang++' : 'g++')
    default: return null
  }
}
export const isPreviewable = (rel: string) => /\.html?$/i.test(rel)
export const canRunFile = (rel: string) => isPreviewable(rel) || commandForFile(rel) !== null

export async function runFile(rel: string) {
  const projectId = useStore.getState().projectId
  if (!projectId) return
  const f = useStore.getState().files.find((x) => x.path === rel)
  if (f && f.content !== f.saved) await actions.saveFile(rel)
  if (isPreviewable(rel)) { await invoke('run:preview', { projectId, path: rel }).catch((e) => toast((e as Error).message, 'error')); return }
  const cmd = commandForFile(rel)
  if (cmd) actions.runInTerminal(cmd)
}

type Snip = { ext: string; cmd?: (file: string) => string; preview?: boolean }
export function snippetTable(mac = IS_MAC): Record<string, Snip> {
  const q = (f: string) => quote(f, mac)
  const shell: Snip = mac ? { ext: 'sh', cmd: (f) => `sh ${q(f)}` } : { ext: 'ps1', cmd: (f) => `powershell -NoProfile -ExecutionPolicy Bypass -File ${q(f)}` }
  const pwsh: Snip = mac ? { ext: 'ps1', cmd: (f) => `pwsh -File ${q(f)}` } : shell
  const py: Snip = { ext: 'py', cmd: (f) => `${mac ? 'python3' : 'python'} ${q(f)}` }
  const js: Snip = { ext: 'js', cmd: (f) => `node ${q(f)}` }
  const ts: Snip = { ext: 'ts', cmd: (f) => `npx --yes tsx ${q(f)}` }
  const t: Record<string, Snip> = {
    powershell: pwsh, ps1: pwsh, pwsh,
    shell, bash: mac ? { ext: 'sh', cmd: (f) => `bash ${q(f)}` } : shell, sh: shell, zsh: mac ? { ext: 'sh', cmd: (f) => `zsh ${q(f)}` } : shell, console: shell,
    python: py, py, javascript: js, js, typescript: ts, ts,
    html: { ext: 'html', preview: true }, lua: { ext: 'lua', cmd: (f) => `lua ${q(f)}` }
  }
  if (!mac) { t.cmd = { ext: 'bat', cmd: (f) => `cmd /c ${q(f)}` }; t.bat = t.cmd }
  if (mac) t.swift = { ext: 'swift', cmd: (f) => `swift ${q(f)}` }
  return t
}
const SNIPPET = snippetTable()
export const canRunSnippet = (lang: string) => lang.toLowerCase() in SNIPPET

export async function runSnippet(lang: string, code: string) {
  const s = SNIPPET[lang.toLowerCase()]
  if (!s) return
  try {
    if (s.preview) { await invoke('run:preview', { html: code }); return }
    const file = await invoke<string>('run:writeTemp', { ext: s.ext, content: code })
    actions.runInTerminal(s.cmd!(file))
  } catch (e) { toast((e as Error).message, 'error') }
}
