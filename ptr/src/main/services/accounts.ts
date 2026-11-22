// Local account system: sign-up / sign-in stored on this computer only (no server).
// Passwords are never stored: only a salted scrypt hash, compared in constant time.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { AuthStatus, AuthUser } from '../../shared/types'

interface StoredUser {
  id: string
  username: string
  email: string
  salt: string // hex
  hash: string // hex
  createdAt: number
  lastLoginAt?: number
}
interface AccountsFile {
  users: StoredUser[]
  /** Id of the user who chose "stay signed in". Only an id: it grants nothing outside this app's data folder. */
  rememberedUserId: string | null
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }
const MAX_FAILS = 5
const LOCK_MS = 30_000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[\p{L}\p{N}_.\-]{3,32}$/u

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export class AccountStore {
  private data: AccountsFile
  /** Signed-in user for the current run of the app. */
  private currentId: string | null = null
  private fails = new Map<string, { count: number; until: number }>()

  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true })
    this.data = this.load()
    // Restore a session only if the user asked to stay signed in and the account still exists.
    const remembered = this.data.rememberedUserId
    if (remembered && this.data.users.some((u) => u.id === remembered)) this.currentId = remembered
  }

  private get file() { return path.join(this.dir, 'accounts.json') }

  private load(): AccountsFile {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<AccountsFile>
      return { users: Array.isArray(raw.users) ? raw.users : [], rememberedUserId: raw.rememberedUserId ?? null }
    } catch {
      return { users: [], rememberedUserId: null }
    }
  }

  private save() {
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }

  private pub(u: StoredUser): AuthUser { return { id: u.id, username: u.username, email: u.email, createdAt: u.createdAt } }

  isSignedIn(): boolean { return this.currentId !== null && this.data.users.some((u) => u.id === this.currentId) }

  status(): AuthStatus {
    const u = this.data.users.find((x) => x.id === this.currentId)
    return { signedIn: !!u, user: u ? this.pub(u) : null, hasAccounts: this.data.users.length > 0 }
  }

  async register(input: { username: string; email: string; password: string; remember: boolean }): Promise<AuthStatus> {
    const username = input.username.trim()
    const email = input.email.trim().toLowerCase()
    if (!USERNAME_RE.test(username)) throw new Error('Username must be 3–32 characters (letters, numbers, . _ -).')
    if (!EMAIL_RE.test(email) || email.length > 254) throw new Error('Enter a valid email address.')
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters.')
    if (input.password.length > 200) throw new Error('Password is too long.')
    if (this.data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error('This username is already taken.')
    if (this.data.users.some((u) => u.email === email)) throw new Error('An account with this email already exists.')

    const salt = crypto.randomBytes(16)
    const hash = await derive(input.password, salt)
    const user: StoredUser = { id: crypto.randomUUID(), username, email, salt: salt.toString('hex'), hash: hash.toString('hex'), createdAt: Date.now(), lastLoginAt: Date.now() }
    this.data.users.push(user)
    this.currentId = user.id
    this.data.rememberedUserId = input.remember ? user.id : null
    this.save()
    return this.status()
  }

  async login(input: { identifier: string; password: string; remember: boolean }): Promise<AuthStatus> {
    const key = input.identifier.trim().toLowerCase()
    const lock = this.fails.get(key)
    if (lock && lock.until > Date.now()) throw new Error('Too many attempts. Try again in a few seconds.')

    const user = this.data.users.find((u) => u.email === key || u.username.toLowerCase() === key)
    // Always run the hash (even for unknown users) so response time does not reveal which accounts exist.
    const salt = user ? Buffer.from(user.salt, 'hex') : crypto.randomBytes(16)
    const candidate = await derive(input.password, salt)
    const expected = user ? Buffer.from(user.hash, 'hex') : Buffer.alloc(SCRYPT.keylen)
    const ok = !!user && candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)

    if (!ok) {
      // A finished lock (until > 0 but past) restarts the counter; otherwise keep counting.
      const count = (lock && lock.until === 0 ? lock.count : 0) + 1
      this.fails.set(key, count >= MAX_FAILS ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 })
      throw new Error('Incorrect username/email or password.')
    }
    this.fails.delete(key)
    user.lastLoginAt = Date.now()
    this.currentId = user.id
    this.data.rememberedUserId = input.remember ? user.id : null
    this.save()
    return this.status()
  }

  logout(): AuthStatus {
    this.currentId = null
    this.data.rememberedUserId = null
    this.save()
    return this.status()
  }
}
