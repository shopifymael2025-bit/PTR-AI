import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { HardDrive, Cloud, Plug, Code2, ArrowRight, FolderOpen, FolderPlus, MessageSquare, Sparkles } from 'lucide-react'
import { useStore, actions } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'
import { AsciiLogo, Logo } from './Logo'
import { OllamaManager, ProviderCard } from './settings/ModelsSection'
import type { ProviderConfig } from '@shared/types'

type Choice = 'ollama' | 'ptrai' | 'openrouter' | 'opencode' | 'custom'

export function Onboarding() {
  const t = useT()
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<Choice>('ollama')
  const providers = useStore((s) => s.providers)
  const selected = useStore((s) => s.selected)
  const lang = useStore((s) => s.settings?.language)
  // Real app version (from package.json via the main process), never hard-coded.
  const [version, setVersion] = useState('')
  useEffect(() => { invoke<{ version: string }>('app:info').then((i) => setVersion(i.version)).catch(() => {}) }, [])

  useEffect(() => { if (step === 2 && choice === 'ollama') { actions.refreshOllama(); actions.refreshModels() } }, [step, choice])

  const finish = async () => { await actions.updateSettings({ onboarded: true }); useStore.setState({ modal: null }) }
  const chooseProvider = async (c: Choice) => {
    setChoice(c)
    if (c === 'ptrai' || c === 'openrouter' || c === 'opencode') {
      const p = providers.find((x) => x.id === c)
      if (p && !p.enabled) useStore.setState({ providers: await invoke<ProviderConfig[]>('providers:save', { ...p, enabled: true }) })
    }
    if (c === 'custom' && !providers.some((p) => p.id.startsWith('custom-'))) {
      useStore.setState({ providers: await invoke<ProviderConfig[]>('providers:save', { id: `custom-${Date.now().toString(36)}`, kind: 'openai', name: 'Custom (OpenAI-compatible)', baseUrl: 'http://localhost:1234/v1', enabled: true }) })
    }
    setStep(2)
  }
  const options: { id: Choice; icon: typeof HardDrive; title: string; desc: string }[] = [
    { id: 'ollama', icon: HardDrive, title: 'Ollama', desc: t('Run models locally. Free, private, offline.') },
    { id: 'ptrai', icon: Sparkles, title: 'PTR AI (Beta)', desc: t('Our own AI model, in beta. May make mistakes.') },
    { id: 'openrouter', icon: Cloud, title: 'OpenRouter', desc: t('Connect cloud models with an API key. Some are free.') },
    { id: 'opencode', icon: Code2, title: 'OpenCode Zen', desc: t('Free models from the OpenCode team (limited without an account).') },
    { id: 'custom', icon: Plug, title: t('Custom provider'), desc: t('Any OpenAI-compatible endpoint (OpenAI, Gemini, Groq, LM Studio…).') }
  ]

  return (
    <div className="fixed inset-0 z-[60] bg-app flex">
      <div className="drag absolute top-0 inset-x-0 h-10" />
      <div className="w-[42%] shrink-0 hero-panel flex flex-col justify-between p-12 relative overflow-hidden">
        <Logo size={20} />
        <AsciiLogo className="!text-white opacity-90 !text-[13px]" />
        <div>
          <div className="mono text-[11px] tracking-[0.18em] opacity-60 mb-3">PTR AI{version ? ` · ${version}` : ''} · WINDOWS</div>
          <div className="text-[13px] opacity-70 max-w-[320px]">{t('Local-first AI coding agent. No account. Your files stay on your machine unless you choose a cloud model.')}</div>
        </div>
      </div>
      <div className="flex-1 flex flex-col p-12 pt-16 min-w-0">
        <div className="flex items-center gap-1.5 mb-10">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-[3px] rounded-full transition-all ${i <= step ? 'grad-fill w-8' : 'bg-line w-4'}`} />)}
          <div className="ml-auto flex gap-1 no-drag">{(['en', 'fr'] as const).map((l) => <button key={l} onClick={() => actions.updateSettings({ language: l })} className={`h-6 px-2 rounded text-2xs mono ${lang === l ? 'bg-bg3 text-fg' : 'text-fg3'}`}>{l.toUpperCase()}</button>)}</div>
        </div>
        {(
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="flex-1 flex flex-col min-h-0">
            {step === 0 && (
              <div className="flex-1 flex flex-col justify-end pb-10">
                <h1 className="text-[76px] leading-[0.95] font-medium tracking-[-0.045em]">{t('welcome').replace(/ PTR AI$/, '')}<br />PTR AI.</h1>
                <p className="mt-6 text-[20px] text-fg2 tracking-tight">{t('tagline')}</p>
                <div className="mt-12 flex gap-3"><button className="btn-primary h-11 px-6 text-[14px]" onClick={() => setStep(1)}>{t('next')} <ArrowRight size={15} /></button></div>
              </div>
            )}
            {step === 1 && (
              <div>
                <h2 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em]">{t('chooseProvider')}</h2>
                <div className="mt-10 grid gap-3 max-w-[560px]">
                  {options.map((o) => (
                    <button key={o.id} onClick={() => chooseProvider(o.id)} className="group text-left card px-5 py-4 flex items-center gap-4 hover:border-fg3 transition-colors">
                      <o.icon size={20} strokeWidth={1.5} /><div className="flex-1"><div className="text-[15px] font-medium">{o.title}</div><div className="text-[13px] text-fg2">{o.desc}</div></div>
                      <ArrowRight size={16} className="text-fg3 group-hover:text-fg group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ))}
                </div>
                <button className="btn mt-6" onClick={() => setStep(0)}>{t('back')}</button>
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col min-h-0 flex-1">
                <h2 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em]">{t('connectModel')}</h2>
                <div className="mt-8 flex-1 overflow-y-auto pr-2 max-w-[640px] no-drag">
                  {choice === 'ollama' && <OllamaManager />}
                  {choice !== 'ollama' && providers.filter((p) => (choice === 'custom' ? p.id.startsWith('custom-') : p.id === choice)).map((p) => <ProviderCard key={p.id} p={p} />)}
                </div>
                <div className="pt-6 flex items-center gap-3">
                  <button className="btn" onClick={() => setStep(1)}>{t('back')}</button>
                  <span className="text-[12.5px] text-fg3 mono truncate">{selected ? `✓ ${selected.model}` : t('No model selected yet')}</span>
                  <button className="btn-outline ml-auto" onClick={() => setStep(3)}>{selected ? t('next') : t('skip')}</button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <h2 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em] max-w-[560px]">{t('openOrStart')}</h2>
                <div className="mt-10 grid gap-3 max-w-[560px]">
                  <button className="card px-5 py-4 flex items-center gap-4 text-left hover:border-fg3" onClick={async () => { await actions.openProjectDialog(); if (useStore.getState().projectId) finish() }}><FolderOpen size={20} strokeWidth={1.5} /><div><div className="text-[15px] font-medium">{t('openProject')}</div><div className="text-[13px] text-fg2">{t('Pick an existing folder on this PC')}</div></div></button>
                  <button className="card px-5 py-4 flex items-center gap-4 text-left hover:border-fg3" onClick={async () => { await actions.openProjectDialog(true); if (useStore.getState().projectId) finish() }}><FolderPlus size={20} strokeWidth={1.5} /><div><div className="text-[15px] font-medium">{t('newWorkspace')}</div><div className="text-[13px] text-fg2">{t('Choose or create an empty folder')}</div></div></button>
                  <button className="card px-5 py-4 flex items-center gap-4 text-left hover:border-fg3" onClick={finish}><MessageSquare size={20} strokeWidth={1.5} /><div><div className="text-[15px] font-medium">{t('Just chat')}</div><div className="text-[13px] text-fg2">{t('You can open a project later with Ctrl+O')}</div></div></button>
                </div>
                <div className="mt-8 flex gap-3"><button className="btn" onClick={() => setStep(2)}>{t('back')}</button><button className="btn-primary ml-auto" onClick={finish}>{t('finish')} <ArrowRight size={15} /></button></div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
