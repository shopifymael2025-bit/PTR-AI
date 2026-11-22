import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { useStore, resolveConfirm } from '../lib/store'
import { useT } from '../lib/i18n'

/** PTR AI-styled confirmation dialog (Enter confirms, Escape cancels). */
export function ConfirmModal() {
  const t = useT()
  const st = useStore((s) => s.confirmState)
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!st) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); resolveConfirm(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [st])
  if (!st) return null
  const [title, ...rest] = st.message.split('\n\n')
  return (
    <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px] grid place-items-center p-8" onClick={() => resolveConfirm(false)}>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.14 }}
        className="w-[440px] rounded-2xl border border-line bg-bg2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden"
        role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex gap-4">
          <div className={`w-9 h-9 shrink-0 rounded-xl grid place-items-center ${st.danger ? 'bg-del/15 text-del' : 'bg-bg3 text-fg2'}`}>
            {st.danger ? <AlertTriangle size={17} strokeWidth={1.8} /> : <HelpCircle size={17} strokeWidth={1.8} />}
          </div>
          <div className="min-w-0 pt-1">
            <div className="text-[14px] font-medium leading-snug">{title}</div>
            {rest.length > 0 && <div className="mt-2 text-[12.5px] text-fg2 whitespace-pre-wrap break-words selectable">{rest.join('\n\n')}</div>}
          </div>
        </div>
        <div className="px-5 py-3.5 bg-bg flex justify-end gap-2 border-t border-line">
          <button className="btn-outline h-8" onClick={() => resolveConfirm(false)}>{t('cancel')}</button>
          <button ref={okRef} onClick={() => resolveConfirm(true)}
            className={`h-8 px-4 rounded-full text-[13px] font-medium transition-opacity hover:opacity-90 ${st.danger ? 'bg-del text-white' : 'bg-accent text-accent-fg'}`}>
            {st.okLabel ?? (st.danger ? t('delete') : t('Confirm'))}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
