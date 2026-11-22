import { useMemo, useState } from 'react'
import { ChevronDown, HardDrive, Cloud, Wrench, MessageSquare, RefreshCw, Search, AlertTriangle, Settings2 } from 'lucide-react'
import { useStore, actions } from '../../lib/store'
import { useT } from '../../lib/i18n'

export function fmtBytes(n?: number) {
  if (!n) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}
export const fmtCtx = (n?: number) => (n ? (n >= 1000 ? `${Math.round(n / 1000)}k ctx` : `${n} ctx`) : '')

export function ModelPicker() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const models = useStore((s) => s.models)
  const providers = useStore((s) => s.providers)
  const errors = useStore((s) => s.modelErrors)
  const loading = useStore((s) => s.modelsLoading)
  const selected = useStore((s) => s.selected)
  const freeOnly = useStore((s) => s.settings?.freeModelsOnly ?? true)

  // "Free only" hides models whose price is known to be non-zero; unknown-price models stay visible (labelled).
  const matching = useMemo(() => models.filter((m) => (m.name + m.id).toLowerCase().includes(q.toLowerCase())), [models, q])
  const filtered = useMemo(() => matching.filter((m) => !freeOnly || m.local || m.free !== false), [matching, freeOnly])
  const current = models.find((m) => m.providerId === selected?.providerId && m.id === selected?.model)
  const label = current?.name ?? selected?.model ?? t('selectModel')

  return (
    <div className="relative">
      <button className="btn h-7 px-2 text-[12.5px] max-w-[260px]" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{label}</span><ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-9 left-0 w-[420px] card shadow-2xl z-20 overflow-hidden">
            <div className="p-2 border-b border-line flex items-center gap-2">
              <div className="relative flex-1"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search models')} className="field h-8 pl-8" /></div>
              <button className="icon-btn" title="Refresh" aria-label="Refresh models" onClick={() => actions.refreshModels()}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
              <button className="icon-btn" title={t('Manage models')} aria-label={t('Manage models')} onClick={() => { setOpen(false); useStore.setState({ modal: 'settings', settingsSection: 'models' }) }}><Settings2 size={13} /></button>
            </div>
            <label className="px-3 py-2 flex items-center gap-2 text-2xs text-fg2 border-b border-line cursor-pointer">
              <input type="checkbox" checked={freeOnly} onChange={(e) => actions.updateSettings({ freeModelsOnly: e.target.checked })} />
              {t('Only show free models (local Ollama + cloud models priced at $0)')}
            </label>
            <div className="max-h-[360px] overflow-y-auto p-1" role="listbox">
              {providers.filter((p) => p.enabled).map((p) => {
                const list = filtered.filter((m) => m.providerId === p.id)
                const err = errors.find((e) => e.providerId === p.id)
                return (
                  <div key={p.id} className="mb-1">
                    <div className="label px-2 pt-2 pb-1 flex items-center gap-1.5">{p.kind === 'ollama' ? <HardDrive size={11} /> : <Cloud size={11} />}{p.name}{p.id === 'ptrai' && <span className="normal-case tracking-normal text-2xs px-1 rounded border border-warn text-warn">Beta</span>}<span className="normal-case tracking-normal text-fg3">· {list.length}</span></div>
                    {err && <div className="mx-2 mb-1 text-2xs text-warn flex gap-1.5"><AlertTriangle size={11} className="shrink-0 mt-0.5" />{err.message}</div>}
                    {list.slice(0, 200).map((m) => {
                      const active = selected?.providerId === m.providerId && selected?.model === m.id
                      return (
                        <button key={m.id} role="option" aria-selected={active} onClick={() => { actions.selectModel(m.providerId, m.id); setOpen(false) }}
                          className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-bg3 ${active ? 'bg-bg3' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] truncate">{m.name}</div>
                            <div className="text-2xs text-fg3 mono truncate">{[m.local ? t('local') : t('cloud'), m.details, fmtBytes(m.sizeBytes), fmtCtx(m.contextLength)].filter(Boolean).join(' · ')}</div>
                          </div>
                          {!m.local && (m.free === true ? <span className="text-2xs px-1.5 rounded border border-line text-fg2">{t('free')}</span> : m.free === false ? <span className="text-2xs px-1.5 rounded border border-line text-warn">{t('Paid')}</span> : <span className="text-2xs text-fg3" title={t('price unknown')}>$?</span>)}
                          <span title={m.toolSupport === 'yes' ? 'Supports tool calling (agent can edit files and run commands)' : m.toolSupport === 'no' ? 'No tool calling — chat-only mode' : 'Tool support unknown — PTR AI will try and fall back to chat-only'}
                            className={`text-2xs flex items-center gap-1 ${m.toolSupport === 'yes' ? 'text-fg2' : 'text-fg3'}`}>
                            {m.toolSupport === 'no' ? <MessageSquare size={11} /> : <Wrench size={11} />}{m.toolSupport === 'yes' ? t('tools') : m.toolSupport === 'no' ? t('noTools') : '?'}
                          </span>
                        </button>
                      )
                    })}
                    {(() => { const hidden = matching.filter((m) => m.providerId === p.id).length - list.length; return hidden > 0 && (
                      <div className="px-2 py-1 text-2xs text-fg3">{hidden} {t('paid models hidden')} · <button className="underline hover:text-fg" onClick={() => actions.updateSettings({ freeModelsOnly: false })}>{t('show')}</button></div>
                    ) })()}
                    {!list.length && !err && !matching.some((m) => m.providerId === p.id) && <div className="px-2 py-1 text-2xs text-fg3">{t('noModels')}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
