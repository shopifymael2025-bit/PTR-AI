// Interactive terminals (node-pty). Each terminal is bound to a webContents and a cwd inside an open project.
import { createRequire } from 'node:module'
import type { WebContents } from 'electron'

const require = createRequire(import.meta.url)
type IPty = { onData(cb: (d: string) => void): void; onExit(cb: (e: { exitCode: number }) => void): void; write(d: string): void; resize(c: number, r: number): void; kill(): void; pid: number }

export class TerminalService {
  private terms = new Map<string, { pty: IPty; owner: WebContents }>()
  private seq = 0
  private ptyMod: { spawn: (file: string, args: string[], opts: Record<string, unknown>) => IPty } | null = null
  loadError: string | null = null

  private mod() {
    if (this.ptyMod || this.loadError) return this.ptyMod
    try { this.ptyMod = require('@lydell/node-pty') } catch (e) { this.loadError = (e as Error).message }
    return this.ptyMod
  }

  create(owner: WebContents, cwd: string, shell: string, cols: number, rows: number): string {
    const m = this.mod()
    if (!m) throw new Error(`Terminal unavailable: ${this.loadError}`)
    const win = process.platform === 'win32'
    let sh: string, args: string[]
    if (win) {
      const allowed = ['powershell.exe', 'pwsh.exe', 'cmd.exe']
      sh = allowed.includes(shell.toLowerCase()) ? shell : 'powershell.exe'
      args = sh === 'cmd.exe' ? [] : ['-NoLogo']
    } else {
      // macOS/Linux: only well-known shells, launched as login shells.
      const allowed = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/local/bin/pwsh', '/opt/homebrew/bin/pwsh']
      sh = allowed.includes(shell) ? shell : (process.env.SHELL && allowed.includes(process.env.SHELL) ? process.env.SHELL : process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
      args = sh.endsWith('pwsh') ? ['-NoLogo'] : ['-l']
    }
    const pty = m.spawn(sh, args, { name: 'xterm-256color', cols, rows, cwd, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }, useConpty: true })
    const id = `t${++this.seq}`
    this.terms.set(id, { pty, owner })
    pty.onData((d) => { if (!owner.isDestroyed()) owner.send('term:data', { id, data: d }) })
    pty.onExit((e) => { this.terms.delete(id); if (!owner.isDestroyed()) owner.send('term:exit', { id, code: e.exitCode }) })
    return id
  }

  write(id: string, data: string) { this.terms.get(id)?.pty.write(data) }
  resize(id: string, cols: number, rows: number) { try { this.terms.get(id)?.pty.resize(Math.max(2, cols), Math.max(2, rows)) } catch { /* process may have exited */ } }
  kill(id: string) { const t = this.terms.get(id); if (t) { t.pty.kill(); this.terms.delete(id) } }
  killAll() { for (const id of [...this.terms.keys()]) this.kill(id) }
}
