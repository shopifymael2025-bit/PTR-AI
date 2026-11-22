import { useState } from 'react'
import { X } from 'lucide-react'
import type { Settings } from '@shared/types'
import { TOS_VERSION } from '@shared/app'
import { useStore, safe } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'
import { TERMS } from '../lib/terms'
import { Logo } from './Logo'

const useLang = () => (useStore((s) => s.settings?.language ?? 'en') === 'fr' ? 'fr' : 'en') as 'en' | 'fr'

/** The Terms text itself (shared by the acceptance screen and the read-only viewer). */
export function TermsBody({ className = '' }: { className?: string }) {
  const doc = TERMS[useLang()]
  return (
    <div className={`selectable ${className}`}>
      <div className="text-2xs text-fg3 mono mb-4">{doc.updated} · v{TOS_VERSION}</div>
      {doc.sections.map((s, i) => (
        <section key={i} className="mb-5">
          <h3 className="text-[14px] font-medium mb-1.5">{i + 1}. {s.h}</h3>
          {s.p.map((p, j) => <p key={j} className="text-[13px] text-fg2 leading-relaxed mb-2">{p}</p>)}
        </section>
      ))}
    </div>
  )
}

/**
 * Blocking screen shown until the current version of the Terms is accepted. There is no way past it
 * except accepting (declining quits the app). The main process also refuses to run the agent without it.
 */
export function TermsGate() {
  const t = useT()
  const lang = useLang()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  const accept = async () => {
    setBusy(true)
    const s = await safe(invoke<Settings>('tos:accept', { version: TOS_VERSION }))
    if (s) useStore.setState({ settings: s })
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[400] bg-app text-fg flex flex-col items-center px-8 pt-12 pb-8" role="dialog" aria-modal="true" aria-label={t('Terms of Service')}>
      <div className="drag absolute top-0 inset-x-0 h-10" />
      <div className="w-full max-w-[780px] flex-1 min-h-0 flex flex-col">
        <div className="flex items-center mb-6">
          <Logo size={16} />
          <div className="ml-auto flex gap-1 no-drag">
            {(['en', 'fr'] as const).map((l) => (
              <button key={l} onClick={() => useStore.getState().settings && invoke<Settings>('settings:set', { language: l }).then((s) => useStore.setState({ settings: s }))}
                className={`h-6 px-2 rounded text-2xs mono ${lang === l ? 'bg-bg3 text-fg' : 'text-fg3'}`}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <h1 className="text-[32px] leading-tight font-medium tracking-[-0.03em]">{t('Terms of Service')}</h1>
        <p className="text-[13.5px] text-fg2 mt-1.5 mb-4">{t('You must accept the Terms of Service to use PTR AI. If you decline, the app closes.')}</p>
        <TermsBody className="flex-1 min-h-0 overflow-y-auto card p-6" />
        <label className="no-drag mt-5 flex items-center gap-2.5 text-[13.5px] cursor-pointer w-fit">
          <input type="checkbox" className="w-4 h-4 accent-[#3b82f6]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {t('I have read and accept the Terms of Service')}
        </label>
        <div className="no-drag mt-4 flex items-center justify-between">
          <button className="btn-outline" onClick={() => invoke('window:close')}>{t('Decline and quit')}</button>
          <button className="btn-primary h-10 px-6 text-[14px]" disabled={!checked || busy} onClick={accept}>{t('Accept and continue')}</button>
        </div>
      </div>
    </div>
  )
}

/** Read-only viewer (Settings → About). */
export function TermsViewer({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 grid place-items-center p-8" onClick={onClose}>
      <div className="w-full max-w-[760px] h-full max-h-[680px] rounded-2xl border border-line bg-bg flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Terms of Service')}>
        <div className="flex items-center px-6 h-14 border-b border-line shrink-0">
          <div className="text-[17px] font-medium tracking-tight">{t('Terms of Service')}</div>
          <button className="icon-btn ml-auto" aria-label={t('Close')} onClick={onClose}><X size={15} /></button>
        </div>
        <TermsBody className="flex-1 min-h-0 overflow-y-auto p-6" />
      </div>
    </div>
  )
}
