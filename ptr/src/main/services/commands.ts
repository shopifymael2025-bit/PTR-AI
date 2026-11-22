// Agent command execution: a policy classifier plus a bounded PowerShell runner.
// This is separate from the interactive terminal; every agent command needs approval
// (or an explicit per-project allowlist entry), and dangerous ones always need it.
import { spawn } from 'node:child_process'

const DANGEROUS: { re: RegExp; why: string }[] = [
  { re: /\b(remove-item|rm|rmdir|del|erase|rd)\b[^|;]*(-recurse|-r\b|\/s\b|-rf|-fr)/i, why: 'Recursive delete' },
  { re: /\bformat(-volume)?\b\s+[a-z]:?/i, why: 'Formats a drive' },
  { re: /\b(shutdown|restart-computer|stop-computer)\b/i, why: 'Shuts down or restarts the machine' },
  { re: /\breg(\.exe)?\s+(delete|add)\b|\bremove-itemproperty\b|\bset-itemproperty\b.*hk(lm|cu)/i, why: 'Modifies the Windows registry' },
  { re: /\bgit\s+push\b.*(--force|-f\b)/i, why: 'Force-pushes to a remote' },
  { re: /\bgit\s+reset\s+--hard\b/i, why: 'Discards local changes (git reset --hard)' },
  { re: /\bgit\s+clean\b.*-[a-z]*f/i, why: 'Deletes untracked files (git clean)' },
  { re: /\bgit\s+branch\s+-D\b/, why: 'Force-deletes a branch' },
  { re: /\bgit\s+push\b/i, why: 'Pushes to a remote repository' },
  { re: /\b(set-executionpolicy|bcdedit|diskpart|cipher\s+\/w|takeown|icacls)\b/i, why: 'Changes system or security settings' },
  { re: /\b(invoke-expression|iex)\b|\|\s*(iex|invoke-expression)\b/i, why: 'Executes dynamically downloaded/constructed code' },
  { re: /\b(curl|wget|invoke-webrequest|iwr|irm|invoke-restmethod)\b.*\|\s*(sh|bash|powershell|pwsh|iex)/i, why: 'Pipes a download into a shell' },
  { re: /[a-z]:\\(windows|program files)/i, why: 'Touches system directories' },
  { re: /\b(npm|pnpm|yarn)\s+publish\b/i, why: 'Publishes a package' },
  { re: /\bstop-process\b|\btaskkill\b|\bkillall\b|\bpkill\b|\bkill\s+-9\b/i, why: 'Kills processes' },
  { re: /(^|[;&|]\s*)sudo\b/i, why: 'Runs with administrator rights (sudo)' },
  { re: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(\/|~|\$HOME)(\s|$)/i, why: 'Deletes a system or home folder' },
  { re: /\b(diskutil|csrutil|spctl|launchctl|defaults\s+write|chmod\s+-R\s+777)\b/i, why: 'Changes macOS system settings' },
  { re: /\/(System|Library|usr|bin|sbin|etc)\//, why: 'Touches system directories' }
]

export interface CommandClass { dangerous: boolean; reason?: string; allowKey: string }

export function classifyCommand(cmd: string): CommandClass {
  const hit = DANGEROUS.find((d) => d.re.test(cmd))
  // Allow-list key: the first two words, e.g. "npm test", "python main.py" → "python main.py".
  const allowKey = cmd.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase()
  const chained = /[;&|`]|\$\(/.test(cmd)
  return { dangerous: !!hit, reason: hit?.why, allowKey: chained ? '' : allowKey }
}

export function isAllowlisted(cmd: string, allowlist: string[]): boolean {
  const c = classifyCommand(cmd)
  if (c.dangerous || !c.allowKey) return false
  return allowlist.includes(c.allowKey)
}

/** Shell used for agent commands on macOS/Linux. */
export function posixShell(): string {
  const s = process.env.SHELL
  return s && /\/(zsh|bash|sh|fish)$/.test(s) && !/fish$/.test(s) ? s : process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
}

export interface RunResult { exitCode: number | null; output: string; timedOut: boolean; cancelled: boolean }

export function runCommand(
  cmd: string,
  cwd: string,
  opts: { timeoutMs: number; signal?: AbortSignal; onData?: (s: string) => void; maxOutput?: number }
): Promise<RunResult> {
  return new Promise((resolve) => {
    const max = opts.maxOutput ?? 200_000
    let output = ''
    let timedOut = false
    let cancelled = false
    const win = process.platform === 'win32'
    const env = { ...process.env, CI: '1', FORCE_COLOR: '0' }
    // Windows: PowerShell. macOS/Linux: the user's login shell (zsh by default on macOS), in its own process group.
    const child = win
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${cmd}`], { cwd, windowsHide: true, env })
      : spawn(posixShell(), ['-lc', cmd], { cwd, env, detached: true })
    const push = (b: Buffer) => {
      const s = b.toString('utf8')
      if (output.length < max) output += s
      opts.onData?.(s)
    }
    child.stdout.on('data', push)
    child.stderr.on('data', push)
    const kill = () => {
      try {
        if (win) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
        else process.kill(-child.pid!, 'SIGKILL') // whole process group
      } catch { child.kill('SIGKILL') }
    }
    const timer = setTimeout(() => { timedOut = true; kill() }, opts.timeoutMs)
    const onAbort = () => { cancelled = true; kill() }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (e) => { output += `\n[spawn error] ${e.message}` })
    child.on('close', (code) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      if (output.length >= max) output += '\n[output truncated]'
      resolve({ exitCode: code, output, timedOut, cancelled })
    })
  })
}

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-or-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /(bearer\s+)[A-Za-z0-9._-]{20,}/gi,
  /((?:api[_-]?key|secret|token|password)\s*[=:]\s*["']?)[^\s"']{8,}/gi
]

/** Redact likely secrets from text before it is shown or sent to a model. */
export function redact(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m, p1) => (typeof p1 === 'string' && m.startsWith(p1) ? `${p1}[REDACTED]` : '[REDACTED]'))
  return out
}

export function truncateMiddle(text: string, max = 12000): string {
  if (text.length <= max) return text
  const half = Math.floor(max / 2)
  return `${text.slice(0, half)}\n\n… [${text.length - max} characters truncated] …\n\n${text.slice(-half)}`
}
