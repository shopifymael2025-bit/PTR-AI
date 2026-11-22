// SQLite persistence via sql.js (WASM SQLite — no native build required).
// The database is held in memory and flushed atomically (tmp file + rename) after writes.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { ChatMessage, Conversation, FileChange, Project } from '../../shared/types'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlDb = any

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, path TEXT UNIQUE, last_opened INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, created_at INTEGER, updated_at INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conv_id TEXT, seq INTEGER, created_at INTEGER, data TEXT);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id, seq);
CREATE TABLE IF NOT EXISTS changes (id TEXT PRIMARY KEY, run_id TEXT, conv_id TEXT, project_id TEXT, created_at INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`

export class Database {
  private db!: SqlDb
  private saveTimer: NodeJS.Timeout | null = null
  /** Set when an unreadable database was found and moved aside at startup. */
  recoveredFrom: string | null = null

  private constructor(private file: string | null) {}

  static async open(file: string | null): Promise<Database> {
    const initSqlJs = require('sql.js')
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar', 'app.asar.unpacked')
    const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(fs.existsSync(wasmPath) ? wasmPath : require.resolve('sql.js/dist/sql-wasm.wasm')) })
    const d = new Database(file)
    if (file && fs.existsSync(file)) {
      try {
        d.db = new SQL.Database(fs.readFileSync(file))
        d.db.exec('SELECT count(*) FROM sqlite_master')
      } catch {
        const backup = `${file}.corrupt-${Date.now()}`
        fs.renameSync(file, backup)
        d.recoveredFrom = backup
        d.db = new SQL.Database()
      }
    } else {
      d.db = new SQL.Database()
    }
    d.db.exec(SCHEMA)
    return d
  }

  private all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }

  private run(sql: string, params: unknown[] = []) {
    this.db.run(sql, params)
    this.scheduleSave()
  }

  private scheduleSave() {
    if (!this.file) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 250)
  }

  flush() {
    if (!this.file) return
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null }
    const data: Uint8Array = this.db.export()
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, this.file)
  }

  // ---------- projects ----------
  listProjects(): Project[] {
    return this.all('SELECT data FROM projects ORDER BY last_opened DESC').map((r) => JSON.parse(String(r.data)))
  }
  getProject(id: string): Project | undefined {
    const r = this.all('SELECT data FROM projects WHERE id=?', [id])[0]
    return r ? JSON.parse(String(r.data)) : undefined
  }
  upsertProjectByPath(p: string, name: string): Project {
    const existing = this.all('SELECT data FROM projects WHERE path=?', [p])[0]
    const proj: Project = existing ? { ...JSON.parse(String(existing.data)), lastOpened: Date.now() } : { id: randomUUID(), name, path: p, lastOpened: Date.now() }
    this.saveProject(proj)
    return proj
  }
  saveProject(p: Project) {
    this.run('INSERT OR REPLACE INTO projects (id,name,path,last_opened,data) VALUES (?,?,?,?,?)', [p.id, p.name, p.path, p.lastOpened, JSON.stringify(p)])
  }
  removeProject(id: string) {
    for (const c of this.listConversations(id)) this.deleteConversation(c.id)
    this.run('DELETE FROM projects WHERE id=?', [id])
  }

  // ---------- conversations ----------
  listConversations(projectId: string | null): Conversation[] {
    const rows = projectId === null
      ? this.all('SELECT data FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC')
      : this.all('SELECT data FROM conversations WHERE project_id=? ORDER BY updated_at DESC', [projectId])
    return rows.map((r) => JSON.parse(String(r.data)))
  }
  allConversations(): Conversation[] {
    return this.all('SELECT data FROM conversations ORDER BY updated_at DESC').map((r) => JSON.parse(String(r.data)))
  }
  getConversation(id: string): Conversation | undefined {
    const r = this.all('SELECT data FROM conversations WHERE id=?', [id])[0]
    return r ? JSON.parse(String(r.data)) : undefined
  }
  saveConversation(c: Conversation) {
    this.run('INSERT OR REPLACE INTO conversations (id,project_id,title,created_at,updated_at,data) VALUES (?,?,?,?,?,?)', [c.id, c.projectId, c.title, c.createdAt, c.updatedAt, JSON.stringify(c)])
  }
  createConversation(projectId: string | null, partial: Partial<Conversation> = {}): Conversation {
    const now = Date.now()
    const c: Conversation = { id: randomUUID(), projectId, title: 'New session', createdAt: now, updatedAt: now, mode: 'build', runState: 'idle', ...partial }
    this.saveConversation(c)
    return c
  }
  deleteConversation(id: string) {
    this.run('DELETE FROM messages WHERE conv_id=?', [id])
    this.run('DELETE FROM changes WHERE conv_id=?', [id])
    this.run('DELETE FROM conversations WHERE id=?', [id])
  }

  // ---------- messages ----------
  listMessages(convId: string): ChatMessage[] {
    return this.all('SELECT data FROM messages WHERE conv_id=? ORDER BY seq ASC', [convId]).map((r) => JSON.parse(String(r.data)))
  }
  addMessage(m: ChatMessage) {
    const seq = Number(this.all('SELECT COALESCE(MAX(seq),0)+1 AS s FROM messages WHERE conv_id=?', [m.convId])[0].s)
    this.run('INSERT INTO messages (id,conv_id,seq,created_at,data) VALUES (?,?,?,?,?)', [m.id, m.convId, seq, m.createdAt, JSON.stringify(m)])
    const c = this.getConversation(m.convId)
    if (c) this.saveConversation({ ...c, updatedAt: Date.now() })
  }
  updateMessage(m: ChatMessage) {
    this.run('UPDATE messages SET data=? WHERE id=?', [JSON.stringify(m), m.id])
  }
  /** Deletes the given message and everything after it (used for edit & resend / regenerate). */
  truncateFrom(convId: string, messageId: string) {
    const r = this.all('SELECT seq FROM messages WHERE id=? AND conv_id=?', [messageId, convId])[0]
    if (!r) return
    this.run('DELETE FROM messages WHERE conv_id=? AND seq>=?', [convId, r.seq])
  }

  // ---------- changes ----------
  addChange(ch: FileChange) {
    this.run('INSERT OR REPLACE INTO changes (id,run_id,conv_id,project_id,created_at,data) VALUES (?,?,?,?,?,?)', [ch.id, ch.runId, ch.convId, ch.projectId, ch.createdAt, JSON.stringify(ch)])
  }
  getChange(id: string): FileChange | undefined {
    const r = this.all('SELECT data FROM changes WHERE id=?', [id])[0]
    return r ? JSON.parse(String(r.data)) : undefined
  }
  listChanges(convId: string): FileChange[] {
    return this.all('SELECT data FROM changes WHERE conv_id=? ORDER BY created_at ASC', [convId]).map((r) => JSON.parse(String(r.data)))
  }

  clearAll() {
    this.run('DELETE FROM messages'); this.run('DELETE FROM conversations'); this.run('DELETE FROM changes')
  }
}
