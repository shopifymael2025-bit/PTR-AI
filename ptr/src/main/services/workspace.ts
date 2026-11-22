// Workspace path guard + file helpers. Every file operation (from the agent or the
// editor) goes through resolveInside(), which blocks traversal and symlink escapes.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { DirEntry } from '../../shared/types'

export class PathError extends Error {}

const DEFAULT_IGNORES = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'target', '__pycache__', '.venv', 'venv',
  '.idea', '.vs', 'coverage', '.cache', '.turbo', 'release', 'bin', 'obj', '.gradle', '.pytest_cache'
])
export const MAX_READ_BYTES = 512 * 1024

function realpathNearest(p: string): string {
  // realpath of the nearest existing ancestor, then re-append the missing tail.
  let cur = p
  const tail: string[] = []
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur)
    if (parent === cur) break
    tail.unshift(path.basename(cur))
    cur = parent
  }
  return path.join(fs.realpathSync.native(cur), ...tail)
}

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export class Workspace {
  readonly root: string
  private ignoreMatchers: RegExp[] = []
  /** sha1 of file content at last agent read — used to detect external modification. */
  readonly readHashes = new Map<string, string>()

  constructor(root: string) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new PathError(`Workspace folder does not exist: ${root}`)
    this.root = fs.realpathSync.native(path.resolve(root))
    this.loadGitignore()
  }

  /** Resolve a user/model-supplied path to an absolute path inside the workspace or throw. */
  resolveInside(p: string): string {
    if (typeof p !== 'string' || p.includes('\0')) throw new PathError('Invalid path')
    const cleaned = p.trim().replace(/^["']|["']$/g, '')
    const abs = path.resolve(this.root, cleaned)
    if (!isWithin(this.root, abs)) throw new PathError(`Path is outside the workspace: ${p}`)
    const real = realpathNearest(abs)
    if (!isWithin(this.root, real)) throw new PathError(`Path escapes the workspace through a link: ${p}`)
    return abs
  }

  rel(abs: string): string {
    return path.relative(this.root, abs).split(path.sep).join('/') || '.'
  }

  private loadGitignore() {
    const gi = path.join(this.root, '.gitignore')
    if (!fs.existsSync(gi)) return
    for (const raw of fs.readFileSync(gi, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || line.startsWith('!')) continue
      const pat = line.replace(/^\//, '').replace(/\/$/, '')
      const re = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*').replace(/\?/g, '.')
      this.ignoreMatchers.push(new RegExp(`(^|/)${re}($|/)`))
    }
  }

  isIgnored(relPath: string, name: string): boolean {
    if (DEFAULT_IGNORES.has(name)) return true
    return this.ignoreMatchers.some((m) => m.test(relPath))
  }

  list(relDir: string, includeIgnored = false): DirEntry[] {
    const abs = this.resolveInside(relDir || '.')
    const entries = fs.readdirSync(abs, { withFileTypes: true })
    const out: DirEntry[] = []
    for (const e of entries) {
      const full = path.join(abs, e.name)
      const r = this.rel(full)
      if (!includeIgnored && this.isIgnored(r, e.name)) continue
      let isDir = e.isDirectory()
      if (e.isSymbolicLink()) {
        try { const real = fs.realpathSync.native(full); if (!isWithin(this.root, real)) continue; isDir = fs.statSync(real).isDirectory() } catch { continue }
      }
      out.push({ name: e.name, path: r, isDir, size: isDir ? undefined : safeSize(full) })
    }
    return out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  }

  /** Walk files (respecting ignores), yielding relative paths. Bounded to protect the UI. */
  walk(limit = 20000): string[] {
    const out: string[] = []
    const stack = [this.root]
    while (stack.length && out.length < limit) {
      const dir = stack.pop()!
      let entries: fs.Dirent[]
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        const r = this.rel(full)
        if (this.isIgnored(r, e.name) || e.isSymbolicLink()) continue
        if (e.isDirectory()) stack.push(full)
        else out.push(r)
      }
    }
    return out.sort()
  }

  tree(maxEntries = 300): string {
    const files = this.walk(maxEntries + 1)
    const lines = files.slice(0, maxEntries)
    if (files.length > maxEntries) lines.push(`… (more files not shown)`)
    return lines.join('\n')
  }

  readText(relPath: string): { content: string; truncated: boolean; binary: boolean; size: number } {
    const abs = this.resolveInside(relPath)
    const st = fs.statSync(abs)
    if (st.isDirectory()) throw new PathError(`${relPath} is a directory`)
    const fd = fs.openSync(abs, 'r')
    const len = Math.min(st.size, MAX_READ_BYTES)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, 0)
    fs.closeSync(fd)
    if (isBinary(buf)) return { content: '', truncated: false, binary: true, size: st.size }
    let content = buf.toString('utf8')
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
    return { content, truncated: st.size > MAX_READ_BYTES, binary: false, size: st.size }
  }

  readFull(relPath: string): string | null {
    const abs = this.resolveInside(relPath)
    if (!fs.existsSync(abs)) return null
    return fs.readFileSync(abs, 'utf8')
  }

  hash(content: string) { return crypto.createHash('sha1').update(content).digest('hex') }

  /**
   * Write text preserving the existing file's line endings and BOM.
   * Returns the content as it was before (null if new).
   */
  writeText(relPath: string, content: string): string | null {
    const abs = this.resolveInside(relPath)
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
    let out = content
    if (before !== null) {
      const crlf = /\r\n/.test(before)
      out = out.replace(/\r\n/g, '\n')
      if (crlf) out = out.replace(/\n/g, '\r\n')
      if (before.charCodeAt(0) === 0xfeff && out.charCodeAt(0) !== 0xfeff) out = '﻿' + out
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const tmp = `${abs}.ptrai-tmp`
    fs.writeFileSync(tmp, out, 'utf8')
    fs.renameSync(tmp, abs)
    return before
  }

  remove(relPath: string) {
    const abs = this.resolveInside(relPath)
    if (abs === this.root) throw new PathError('Refusing to delete the workspace root')
    fs.rmSync(abs, { recursive: false })
  }

  searchContent(query: string, opts: { regex?: boolean; glob?: string; maxResults?: number } = {}): string[] {
    const max = opts.maxResults ?? 200
    let re: RegExp
    try { re = opts.regex ? new RegExp(query, 'i') : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } catch (e) { throw new Error(`Invalid regex: ${(e as Error).message}`) }
    const globRe = opts.glob ? globToRegex(opts.glob) : null
    const results: string[] = []
    for (const f of this.walk()) {
      if (globRe && !globRe.test(f)) continue
      let text: { content: string; binary: boolean }
      try { text = this.readText(f) } catch { continue }
      if (text.binary) continue
      const lines = text.content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          results.push(`${f}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
          if (results.length >= max) return results
        }
      }
    }
    return results
  }

  searchFiles(pattern: string, max = 200): string[] {
    const q = pattern.toLowerCase()
    const isGlob = /[*?]/.test(pattern)
    const re = isGlob ? globToRegex(pattern) : null
    return this.walk().filter((f) => (re ? re.test(f) : f.toLowerCase().includes(q))).slice(0, max)
  }
}

export function globToRegex(glob: string): RegExp {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.')
  return new RegExp(`(^|/)${re}$`, 'i')
}

function safeSize(p: string) { try { return fs.statSync(p).size } catch { return undefined } }

export function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}
