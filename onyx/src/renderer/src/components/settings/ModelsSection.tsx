import { useEffect, useMemo, useState } from 'react'
import { Download, Trash2, RefreshCw, X, CheckCircle2, XCircle, Plus, KeyRound, ExternalLink, HardDrive, Cloud, ChevronDown } from 'lucide-react'
import type { ProviderConfig, PullProgress } from '@shared/types'
import { useStore, actions, safe, toast, confirmDialog } from '../../lib/store'
import { invoke, on } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { fmtBytes, fmtCtx } from '../chat/ModelPicker'

const SUGGESTED = ['qwen2.5-coder:7b', 'qwen3:8b', 'llama3.1:8b', 'qwen2.5-coder:1.5b']

/** OpenAI-compatible services. Free tiers depend on the service and can change. */
export const PRESETS: { name: string; kind: ProviderConfig['kind']; baseUrl: string; keyUrl?: string; note: { en: string; fr: string } }[] = [
  { name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', note: { en: 'Paid per use (no free tier for the API).', fr: 'Payant à l’usage (pas de gratuité pour l’API).' } },
  { name: 'OpenCode Zen', kind: 'opencode', baseUrl: 'https://opencode.ai/zen/v1', keyUrl: 'https://opencode.ai/auth', note: { en: 'Has $0 models (Big Pickle, DeepSeek Flash Free…), limited without an account.', fr: 'Modèles à 0 $ (Big Pickle, DeepSeek Flash Free…), limités sans compte.' } },
  { name: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', note: { en: 'Free tier with rate limits on some models.', fr: 'Offre gratuite limitée sur certains modèles.' } },
  { name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', note: { en: 'Free tier with rate limits.', fr: 'Offre gratuite avec limites.' } },
  { name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys', note: { en: 'Free experimentation tier with limits.', fr: 'Offre d’essai gratuite limitée.' } },
  { name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys', note: { en: 'Paid per use (low prices).', fr: 'Payant à l’usage (prix bas).' } },
  { name: 'LM Studio (local)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', note: { en: 'Local and free. Start the LM Studio server first.', fr: 'Local et gratuit. Lancez d’abord le serveur LM Studio.' } },
  { name: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: 'https://', note: { en: 'Any OpenAI-compatible endpoint.', fr: 'Tout service compatible OpenAI.' } }
]

export function OllamaManager() {
  const t = useT()
  const ollama = useStore((s) => s.ollama)
  const allModels = useStore((s) => s.models)
  const models = useMemo(() => allModels.filter((m) => m.providerKind === 'ollama'), [allModels])
  const [name, setName] = useState('')
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({})

  useEffect(() => on<PullProgress>('ollama:pullProgress', (p) => {
    setPulls((x) => ({ ...x, [p.model]: p }))
    if (p.done) {
      if (p.error) toast(`${p.model}: ${p.error}`, 'error')
      else if (p.status === 'success') { toast(`${p.model} ✓`); actions.refreshModels() }
      setTimeout(() => setPulls((x) => { const n = { ...x }; delete n[p.model]; return n }), 1500)
    }
  }), [])

  const pull = async (m: string) => { if (m.trim()) { await safe(invoke('ollama:pull', m.trim())); setPulls((x) => ({ ...x, [m]: { model: m, status: 'starting' } })) } }
  const del = async (m: string) => { if (await confirmDialog(`${t('Delete this model?')} — ${m}\n\n${t('You can download it again later.')}`)) { await safe(invoke('ollama:delete', m)); actions.refreshModels() } }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 card px-4 py-3">
        <HardDrive size={16} className="text-fg2" />
        <div className="flex-1">
          <div className="text-[13.5px] font-medium">{t('Ollama · local, free, private')}</div>
          <div className="text-[12px] text-fg2">{ollama?.running ? `${t('Running')} · v${ollama.version}` : t('Not running at the configured address')}</div>
        </div>
        {ollama?.running ? <CheckCircle2 size={16} className="text-add" /> : <XCircle size={16} className="text-del" />}
        <button className="icon-btn" aria-label={t('Refresh')} onClick={() => { actions.refreshOllama(); actions.refreshModels() }}><RefreshCw size={13} /></button>
      </div>
      {!ollama?.running && (
        <div className="text-[13px] text-fg2 space-y-2 border-l-2 border-line pl-4">
          <p>{t('Ollama runs open models on your own computer at no cost. To use it:')}</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>{t('Download and install Ollama for Windows from the official site.')}</li>
            <li>{t('Start Ollama (it runs in the tray and listens on http://localhost:11434).')}</li>
            <li>{t('Come back here and press recheck, then download a model below.')}</li>
          </ol>
          <button className="btn-outline h-8 mt-1" onClick={() => invoke('app:openExternal', 'https://ollama.com/download/windows')}><ExternalLink size={13} />ollama.com/download</button>
          <p className="text-2xs text-fg3">{t('PTR AI never installs software without you. Larger models need more RAM/VRAM; 7–8B models generally want ~8 GB of free memory.')}</p>
        </div>
      )}
      {ollama?.running && (
        <>
          <div>
            <div className="label mb-2">{t('Download a model')}</div>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { pull(name); setName('') } }} placeholder="qwen2.5-coder:7b" className="field mono" />
              <button className="btn-primary h-9" disabled={!name.trim()} onClick={() => { pull(name); setName('') }}><Download size={14} />{t('Pull')}</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">{SUGGESTED.map((s) => <button key={s} className="h-6 px-2 rounded-md border border-line text-2xs mono text-fg2 hover:text-fg" onClick={() => pull(s)}>{s}</button>)}</div>
            <div className="text-2xs text-fg3 mt-1.5">{t('Browse the full library at ollama.com/library. Pick models tagged “tools” for full agent mode.')}</div>
          </div>
          {Object.values(pulls).map((p) => (
            <div key={p.model} className="card px-3 py-2.5">
              <div className="flex items-center text-[12.5px]"><span className="mono">{p.model}</span><span className="ml-2 text-fg3">{p.status}</span>
                {!p.done && <button className="icon-btn ml-auto" aria-label={t('cancel')} onClick={() => invoke('ollama:cancelPull', p.model)}><X size={13} /></button>}</div>
              {p.total ? <><div className="mt-2 h-1 rounded-full bg-bg3 overflow-hidden"><div className="h-full grad-fill transition-all" style={{ width: `${((p.completed ?? 0) / p.total) * 100}%` }} /></div>
                <div className="text-2xs text-fg3 mono mt-1">{fmtBytes(p.completed)} / {fmtBytes(p.total)}</div></> : null}
            </div>
          ))}
          <div>
            <div className="label mb-2">{t('Installed')} ({models.length})</div>
            <div className="card divide-y divide-line">
              {models.map((m) => (
                <div key={m.id} className="px-3 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0"><div className="text-[13px] mono truncate">{m.id}</div><div className="text-2xs text-fg3">{[m.details, fmtBytes(m.sizeBytes), fmtCtx(m.contextLength), m.toolSupport === 'yes' ? t('tool calling') : m.toolSupport === 'no' ? t('chat only (no tools)') : t('tool support unknown')].filter(Boolean).join(' · ')}</div></div>
                  <button className="btn h-7" onClick={() => actions.selectModel(m.providerId, m.id)}>{t('Use')}</button>
                  <button className="icon-btn hover:text-del" aria-label={`${t('delete')} ${m.id}`} onClick={() => del(m.id)}><Trash2 size={13} /></button>
                </div>
              ))}
              {!models.length && <div className="px-3 py-3 text-[12.5px] text-fg3">{t('No models installed yet.')}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function ProviderCard({ p }: { p: ProviderConfig }) {
  const t = useT()
  const lang = useStore((s) => s.settings?.language ?? 'en')
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(p.baseUrl)
  const [test, setTest] = useState<null | { ok: boolean; count?: number; error?: string }>(null)
  const [busy, setBusy] = useState(false)
  const preset = PRESETS.find((x) => x.baseUrl === p.baseUrl)
  const save = async (patch: Partial<ProviderConfig>) => { const r = await safe(invoke<ProviderConfig[]>('providers:save', { ...p, ...patch })); if (r) useStore.setState({ providers: r }); actions.refreshModels() }
  const runTest = async () => { setBusy(true); setTest(await invoke('providers:test', p.id)); setBusy(false) }
  const saveKey = async () => { const r = await safe(invoke<ProviderConfig[]>('providers:setKey', { id: p.id, key })); if (r) { useStore.setState({ providers: r }); setKey(''); actions.refreshModels(); runTest() } }
  const keyUrl = p.kind === 'openrouter' ? 'https://openrouter.ai/keys' : p.kind === 'opencode' ? 'https://opencode.ai/auth' : preset?.keyUrl
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {p.kind === 'ollama' ? <HardDrive size={15} /> : <Cloud size={15} />}
        <span className="text-[13.5px] font-medium">{p.name}</span>
        <span className="text-2xs text-fg3 mono">{p.kind}</span>
        {p.id === 'ptrai' && <span className="text-2xs px-1.5 rounded border border-warn text-warn">Beta</span>}
        <label className="ml-auto flex items-center gap-2 text-[12px] text-fg2"><input type="checkbox" checked={p.enabled} onChange={(e) => save({ enabled: e.target.checked })} />{t('Enabled')}</label>
        {!['ollama', 'openrouter', 'ptrai', 'opencode', 'opencode-go'].includes(p.id) && <button className="icon-btn hover:text-del" aria-label={t('Remove provider')} onClick={async () => { if (await confirmDialog(`${t('Remove provider')} — ${p.name} ?`, { okLabel: t('remove') })) { useStore.setState({ providers: await invoke('providers:remove', p.id) }); actions.refreshModels() } }}><Trash2 size={13} /></button>}
      </div>
      <div className="grid grid-cols-[100px_1fr] items-center gap-2 text-[12.5px]">
        <span className="text-fg2">{t('Base URL')}</span>
        <input className="field h-8 mono text-[12px]" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== p.baseUrl && save({ baseUrl: url })} />
        {p.kind !== 'ollama' && <>
          <span className="text-fg2">{t('API key')}</span>
          <div className="flex gap-2">
            <input type="password" className="field h-8 mono text-[12px]" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && key) saveKey() }} placeholder={p.hasKey ? t('•••••••• (stored encrypted)') : t('Paste your key')} />
            <button className="btn-outline h-8" disabled={!key} onClick={saveKey}><KeyRound size={13} />{t('save')}</button>
            {p.hasKey && <button className="btn h-8" onClick={async () => { useStore.setState({ providers: await invoke('providers:setKey', { id: p.id, key: null }) }); actions.refreshModels() }}>{t('Clear')}</button>}
          </div>
          <span className="text-fg2">{t('Tool calling')}</span>
          <select className="field h-8 text-[12px]" value={p.toolSupportOverride ?? 'unknown'} onChange={(e) => save({ toolSupportOverride: e.target.value as ProviderConfig['toolSupportOverride'] })}>
            <option value="unknown">{t('Auto-detect (use provider metadata, fall back if rejected)')}</option><option value="yes">{t('All models support tools')}</option><option value="no">{t('No tool calling (chat only)')}</option>
          </select>
        </>}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-outline h-8" disabled={busy} onClick={runTest}><RefreshCw size={12} className={busy ? 'animate-spin' : ''} />{t('Test connection')}</button>
        {keyUrl && <button className="btn h-8" onClick={() => invoke('app:openExternal', keyUrl)}><ExternalLink size={12} />{t('Get a key')}</button>}
        {test && (test.ok ? <span className="text-[12px] text-add">{t('Connected')} · {test.count} {t('models')}</span> : <span className="text-[12px] text-del selectable">{test.error}</span>)}
      </div>
      {preset && <p className="text-2xs text-fg3">{preset.note[lang === 'fr' ? 'fr' : 'en']}</p>}
      {p.id === 'ptrai' && <p className="text-2xs text-fg3 leading-relaxed">{lang === 'fr'
        ? 'Bêta : le modèle PTR AI est en cours de développement. Il peut se tromper, changer ou être indisponible. En attendant son propre serveur, il utilise Ollama sur votre PC (adresse modifiable ci-dessus), donc rien ne quitte votre ordinateur.'
        : 'Beta: the PTR AI model is under development. It can make mistakes, change or be unavailable. Until it has its own server it runs through Ollama on your PC (address editable above), so nothing leaves your computer.'}</p>}
      {p.kind === 'openrouter' && <p className="text-2xs text-fg3 leading-relaxed">{lang === 'fr'
        ? 'OpenRouter propose des modèles à 0 $ (« :free ») avec des limites ; la plupart sont payants. Gardez « modèles gratuits uniquement » activé pour rester à 0 €. Vos messages et les fichiers lus par l’agent sont envoyés à OpenRouter.'
        : 'OpenRouter has $0 models (ids ending in “:free”) with rate limits; most others are paid. Keep “Only show free models” on to stay at $0. Your prompts and files the agent reads are sent to OpenRouter.'}</p>}
      {p.kind === 'opencode' && !/\/zen\/go\//.test(p.baseUrl) && <p className="text-2xs text-fg3 leading-relaxed">{lang === 'fr'
        ? 'OpenCode Zen (opencode.ai) : certains modèles sont à 0 $ et marchent sans clé (usage limité). Une clé Zen (paiement à l’usage) se met ici. Une clé d’abonnement OpenCode Go doit aller dans le fournisseur « OpenCode Go ». Vos messages sont envoyés à OpenCode.'
        : 'OpenCode Zen (opencode.ai): some models are $0 and work with no key (limited usage). A Zen pay-as-you-go key goes here. An OpenCode Go subscription key goes in the “OpenCode Go” provider instead. Your prompts are sent to OpenCode.'}</p>}
      {p.kind === 'opencode' && /\/zen\/go\//.test(p.baseUrl) && <p className="text-2xs text-fg3 leading-relaxed">{lang === 'fr'
        ? 'OpenCode Go : abonnement OpenCode (à partir de 10 $/mois) avec sa propre adresse. Collez ici la clé de votre abonnement Go (console OpenCode). PTR AI s’identifie comme client et envoie un identifiant de session par discussion, comme OpenCode le demande.'
        : 'OpenCode Go: OpenCode’s subscription (from $10/month) with its own endpoint. Paste your Go subscription key here (OpenCode console). PTR AI identifies itself and sends one session id per conversation, as OpenCode requires.'}</p>}
    </div>
  )
}

export function ModelsSection() {
  const t = useT()
  const providers = useStore((s) => s.providers)
  const lang = useStore((s) => s.settings?.language ?? 'en')
  const [menu, setMenu] = useState(false)
  const add = async (preset: (typeof PRESETS)[number]) => {
    setMenu(false)
    const id = `custom-${Date.now().toString(36)}`
    const r = await safe(invoke<ProviderConfig[]>('providers:save', { id, kind: preset.kind === 'opencode' ? 'openai' : preset.kind, name: preset.name, baseUrl: preset.baseUrl === 'https://' ? 'https://example.com/v1' : preset.baseUrl, enabled: true }))
    if (r) { useStore.setState({ providers: r }); actions.refreshModels() }
  }
  return (
    <div className="space-y-8">
      <OllamaManager />
      <div className="space-y-3">
        <div className="flex items-center relative">
          <div className="label">{t('Providers')}</div>
          <button className="btn h-7 ml-auto" onClick={() => setMenu(!menu)}><Plus size={13} />{t('Add provider')}<ChevronDown size={12} /></button>
          {menu && <>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-8 z-30 w-80 card p-1 shadow-xl">
              {PRESETS.filter((x) => x.kind !== 'opencode').map((x) => (
                <button key={x.name} className="w-full text-left rounded-lg px-3 py-2 hover:bg-bg3" onClick={() => add(x)}>
                  <div className="text-[13px]">{x.name}</div><div className="text-2xs text-fg3">{x.note[lang === 'fr' ? 'fr' : 'en']}</div>
                </button>
              ))}
            </div>
          </>}
        </div>
        {providers.map((p) => <ProviderCard key={p.id} p={p} />)}
        <p className="text-2xs text-fg3">{t('LM Studio, llama.cpp server, vLLM and similar local servers expose OpenAI-compatible endpoints and are free to run.')}</p>
      </div>
    </div>
  )
}
