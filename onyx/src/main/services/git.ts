// Controlled Git CLI access. Only a fixed set of non-destructive subcommands is exposed.
// No push, reset, clean, or branch deletion is offered here.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { GitStatus } from '../../shared/types'

function git(cwd: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      const e = error as (NodeJS.ErrnoException & { code?: number | string }) | null
      if (e && e.code === 'ENOENT') return resolve({ code: -1, out: '', err: 'ENOENT' })
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: stdout, err: stderr })
    })
  })
}

export async function gitStatus(root: string): Promise<GitStatus> {
  const isRepo = fs.existsSync(path.join(root, '.git'))
  const r = await git(root, ['status', '--porcelain=v1', '-b', '-uall'])
  if (r.err === 'ENOENT') return { available: false, isRepo, files: [], error: 'Git is not installed or not on PATH. Install it from https://git-scm.com/download/win' }
  if (r.code !== 0) return { available: true, isRepo: false, files: [], error: r.err.trim() || undefined }
  const lines = r.out.split(/\r?\n/).filter(Boolean)
  const head = lines[0]?.startsWith('## ') ? lines.shift()!.slice(3) : ''
  const branch = head.split('...')[0].replace(/^No commits yet on /, '')
  return {
    available: true, isRepo: true, branch,
    files: lines.map((l) => ({ index: l[0], worktree: l[1], path: l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '') }))
  }
}

const safePath = (p: string) => { if (p.startsWith('-') || p.includes('\0')) throw new Error('Invalid path'); return p }

export async function gitDiff(root: string, file: string, staged: boolean) {
  const r = await git(root, ['diff', ...(staged ? ['--cached'] : []), '--', safePath(file)])
  return r.out
}
export async function gitStage(root: string, files: string[]) { return check(await git(root, ['add', '--', ...files.map(safePath)])) }
export async function gitUnstage(root: string, files: string[]) { return check(await git(root, ['restore', '--staged', '--', ...files.map(safePath)])) }
export async function gitCommit(root: string, message: string) {
  if (!message.trim()) throw new Error('Commit message is empty')
  return check(await git(root, ['commit', '-m', message]))
}
export async function gitLog(root: string) {
  const r = await git(root, ['log', '-n', '30', '--pretty=format:%h%x09%an%x09%ar%x09%s'])
  if (r.code !== 0) return []
  return r.out.split('\n').filter(Boolean).map((l) => { const [hash, author, when, subject] = l.split('\t'); return { hash, author, when, subject } })
}
function check(r: { code: number; out: string; err: string }) {
  if (r.err === 'ENOENT') throw new Error('Git is not installed')
  if (r.code !== 0) throw new Error(r.err.trim() || r.out.trim() || 'git failed')
  return r.out
}
