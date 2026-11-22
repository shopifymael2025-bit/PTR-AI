// Mandatory auto-update via electron-updater using a "generic" feed: any HTTPS folder containing
// latest.yml + the installer (+ .blockmap) produced by `npm run dist`. A GitHub Releases
// "latest/download" URL works as such a folder. Updates are always checked (no opt-out), downloaded
// in the background and verified by electron-updater (sha512 from latest.yml). While one is pending
// (available / downloading / ready) the UI is blocked until the user installs it (or quits, which
// installs it on Windows).
import { app, type WebContents } from 'electron'
import type { UpdateStatus } from '../../shared/types'
import { RELEASES_URL, UPDATE_FEED_URL } from '../../shared/app'

type AutoUpdater = typeof import('electron-updater').autoUpdater

/**
 * The official update feed. Fixed in code: it is not a setting, so users or other apps cannot
 * point PTR AI at a different server. (Only a localhost feed may be injected, for automated tests.)
 */
export const OFFICIAL_UPDATE_URL = UPDATE_FEED_URL
export const OFFICIAL_RELEASES_PAGE = RELEASES_URL

export function feedUrl(): string {
  const test = process.env.PTRAI_TEST_UPDATE_URL
  if (test && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(test)) return test
  return OFFICIAL_UPDATE_URL
}

export function validateFeedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return null
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return null
    return 'The update URL must use https://'
  } catch { return 'Invalid URL' }
}

export class UpdateService {
  private status: UpdateStatus = { state: 'idle' }
  private updater: AutoUpdater | null = null
  private timer: NodeJS.Timeout | null = null
  private targets = new Set<WebContents>()

  constructor(private getConfig: () => { url: string }) {}

  get current() { return this.status }
  /** True while an update is pending: the app must not be used until it is installed. */
  get blocking() { return this.status.state === 'available' || this.status.state === 'downloading' || this.status.state === 'ready' }
  subscribe(wc: WebContents) { this.targets.add(wc); wc.once('destroyed', () => this.targets.delete(wc)) }

  private set(s: UpdateStatus) {
    this.status = s
    for (const wc of this.targets) if (!wc.isDestroyed()) wc.send('update:status', s)
  }

  private async load(): Promise<AutoUpdater> {
    if (this.updater) return this.updater
    // electron-updater is CommonJS: depending on interop, the export may sit under `default`.
    const mod = (await import('electron-updater')) as unknown as { autoUpdater?: AutoUpdater; default?: { autoUpdater: AutoUpdater } }
    const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater
    if (!autoUpdater) throw new Error('Updater module failed to load')
    // macOS only installs updates for apps signed with an Apple Developer ID. PTR AI's free Mac build is
    // not signed, so on macOS it only *detects* new versions and offers the download page.
    const manual = process.platform === 'darwin'
    autoUpdater.autoDownload = !manual
    autoUpdater.autoInstallOnAppQuit = !manual
    autoUpdater.allowPrerelease = false
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'up-to-date', checkedAt: Date.now() }))
    autoUpdater.on('update-available', (i) => this.set(manual ? { state: 'available', version: i.version } : { state: 'downloading', version: i.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => this.set({ ...this.status, state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => this.set({ state: 'ready', version: i.version }))
    autoUpdater.on('error', (e) => this.set({ state: 'error', error: friendly(e) }))
    this.updater = autoUpdater
    return autoUpdater
  }

  /** Starts the checks: shortly after launch, then every hour. Updates are mandatory, so there is no off switch. */
  start() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const { url } = this.getConfig()
    if (!url || !app.isPackaged) return
    setTimeout(() => this.check().catch(() => {}), 2_000)
    this.timer = setInterval(() => this.check().catch(() => {}), 3600_000)
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) { this.set({ state: 'unsupported', error: 'Updates only work in the installed app (not in development mode).' }); return this.status }
    const { url } = this.getConfig()
    if (!url) { this.set({ state: 'unconfigured' }); return this.status }
    const bad = validateFeedUrl(url)
    if (bad) { this.set({ state: 'error', error: bad }); return this.status }
    if (this.status.state === 'downloading' || this.status.state === 'ready') return this.status
    const u = await this.load()
    // Generic feed: Windows reads latest.yml, macOS reads latest-mac.yml from the same release.
    u.setFeedURL({ provider: 'generic', url: url.replace(/\/+$/, '') })
    try { await u.checkForUpdates() } catch (e) { this.set({ state: 'error', error: friendly(e) }) }
    return this.status
  }

  install() {
    if (this.status.state !== 'ready' || !this.updater) throw new Error('No downloaded update to install')
    // isSilent=false shows the installer progress; isForceRunAfter=true relaunches PTR AI.
    this.updater.quitAndInstall(false, true)
  }
}

function friendly(e: unknown): string {
  const m = (e as Error)?.message ?? String(e)
  if (/404|latest\.yml/i.test(m)) return 'No update information found at the update URL (latest.yml missing).'
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|net::/i.test(m)) return 'Could not reach the update server. Check your connection.'
  if (/sha512|checksum/i.test(m)) return 'The downloaded update failed its integrity check and was discarded.'
  return m.split('\n')[0].slice(0, 300)
}
