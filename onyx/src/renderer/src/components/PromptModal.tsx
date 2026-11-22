import { useEffect, useState } from 'react'
import { useStore, resolveAskText } from '../lib/store'
import { useT } from '../lib/i18n'

export function PromptModal() {
  const t = useT()
  const st = useStore((s) => s.promptState)
  const [v, setV] = useState('')
  useEffect(() => { if (st) setV(st.value) }, [st])
  if (!st) return null
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 grid place-items-center p-8" onClick={() => resolveAskText(null)}>
      <form className="w-[480px] card shadow-2xl p-5" role="dialog" aria-label={st.title} onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); resolveAskText(v) }}>
        <div className="text-[13.5px] mb-3">{st.title}</div>
        <input autoFocus className="field mono" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') resolveAskText(null) }} aria-label={st.title} />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn" onClick={() => resolveAskText(null)}>{t('cancel')}</button>
          <button type="submit" className="btn-primary h-8" disabled={!v.trim()}>OK</button>
        </div>
      </form>
    </div>
  )
}
