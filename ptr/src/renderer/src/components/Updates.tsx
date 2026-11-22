import { useEffect, useState } from 'react'
import { Download, RefreshCw, RotateCw, Power } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'
import { LATEST_RELEASE_URL, RELEASES_URL, GITHUB_REPO } from '@shared/app'
import { invoke, on } from '../lib/api'
import { useT } from '../lib/i18n'
import { Logo } from './Logo'

export function useUpdateStatus() {
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => { invoke<UpdateStatus>('update:status').then(setS); return on<UpdateStatus>('update:status', setS) }, [])
  return s
}

function describe(s: UpdateStatus, t: (k: string) => string): string {
  switch (s.state) {
    case 'checking': return t('Checking for updates…')
    case 'up-to-date': return t('PTR AI is up to date.')
    case 'downloading': return `${t('Downloading version')} ${s.version ?? ''}… ${s.percent ?? 0}%`
    case 'ready': return `PTR AI ${s.version} ${t('is ready to install.')}`
    case 'available': return `PTR AI ${s.version} ${t('is available.')}`
    case 'unconfigured': return t('Set an update URL to enable updates.')
    case 'unsupported': return t(s.error ?? '')
    case 'error': return `${t('Update failed:')} ${s.error}`
    default: return t('Not checked yet.')
  }
}

/** Settings → About: manual check. Updates themselves are mandatory (see UpdateGate). */
export function UpdateSettings() {
  const t = useT()
  const s = useUpdateStatus()
  return (
    <div className="py-4 border-b border-line space-y-3">
      <div>
        <div className="text-[13.5px]">{t('Updates are mandatory')}</div>
        <div className="text-[12px] text-fg3 mt-0.5">{t('When a new version is released, you must install it to keep using PTR AI. Checked at launch and every hour.')}</div>
      </div>
      <div className="flex gap-2 items-center">
        {/* Official source, fixed in the app — not editable. */}
        <button className="flex-1 min-w-0 text-left h-8 px-3 rounded-lg bg-bg border border-line mono text-[12px] text-fg2 truncate hover:text-fg" title={t('Official source (cannot be changed)')} onClick={() => invoke('app:openExternal', RELEASES_URL)}>
          github.com/{GITHUB_REPO}
        </button>
        <button className="btn-outline h-8" disabled={s.state === 'checking' || s.state === 'downloading'} onClick={() => invoke('update:check')}><RefreshCw size={12} className={s.state === 'checking' ? 'animate-spin' : ''} />{t('Check now')}</button>
      </div>
      <div className={`text-[12.5px] ${s.state === 'error' ? 'text-del' : 'text-fg2'} selectable`}>{describe(s, t)}</div>
      <p className="text-2xs text-fg3 leading-relaxed">{t('Updates come only from the official PTR AI releases on GitHub. Every download is verified against its SHA-512 before it is installed.')}</p>
    </div>
  )
}

/**
 * Blocking screen shown while an update is pending (found / downloading / downloaded). It cannot be
 * dismissed: the only ways out are installing the update or quitting (which installs it on Windows).
 * If the update server is unreachable (state "error") nothing is blocked, so the app still works offline.
 */
export function UpdateGate() {
  const t = useT()
  const s = useUpdateStatus()
  if (s.state !== 'available' && s.state !== 'downloading' && s.state !== 'ready') return null
  const pct = s.percent ?? 0
  return (
    <div className="fixed inset-0 z-[300] bg-app text-fg grid place-items-center p-8" role="alertdialog" aria-modal="true" aria-label={t('Update required')}>
      <div className="drag absolute top-0 inset-x-0 h-10" />
      <div className="no-drag card w-[480px] p-8 shadow-2xl">
        <Logo size={16} className="mb-6" />
        <h2 className="text-[26px] leading-tight font-medium tracking-[-0.02em]">{t('Update required')}</h2>
        <p className="text-[13.5px] text-fg2 mt-2 leading-relaxed">{t('A new version of PTR AI is available. You must install it to keep using the app.')}</p>
        <div className="mono text-[12.5px] text-fg mt-4">PTR AI {s.version}</div>

        {s.state === 'downloading' && (
          <div className="mt-5">
            <div className="h-1.5 rounded-full bg-bg3 overflow-hidden"><div className="h-full grad-fill transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="text-[12px] text-fg2 mt-2">{t('Downloading the update…')} {pct}%</div>
          </div>
        )}
        {s.state === 'ready' && <p className="text-[12.5px] text-fg2 mt-5">{t('The update is ready. Restart PTR AI to install it.')}</p>}

        <div className="mt-6 flex items-center justify-between">
          <button className="btn-outline" onClick={() => invoke('window:close')}><Power size={13} />{t('Quit PTR AI')}</button>
          {s.state === 'ready' && <button className="btn-primary h-10 px-5 text-[14px]" onClick={() => invoke('update:install')}><RotateCw size={14} />{t('Restart to update')}</button>}
          {s.state === 'available' && <button className="btn-primary h-10 px-5 text-[14px]" onClick={() => invoke('app:openExternal', LATEST_RELEASE_URL)}><Download size={14} />{t('Download the new version')}</button>}
        </div>
      </div>
    </div>
  )
}
