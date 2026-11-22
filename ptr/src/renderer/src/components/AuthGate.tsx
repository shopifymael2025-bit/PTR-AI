import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import type { AuthStatus, Settings } from '@shared/types'
import { useStore } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'
import { Logo } from './Logo'

type Mode = 'signup' | 'signin'

function strength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^\w\s]/.test(pw)) score++
  return (score <= 1 ? 1 : score === 2 ? 2 : 3) as 1 | 2 | 3
}

/**
 * Blocking screen shown until the user is signed in. First launch (no account yet) opens on
 * "Sign up"; afterwards it opens on "Sign in". The main process also refuses to run the agent
 * without a signed-in account.
 */
export function AuthGate() {
  const t = useT()
  const lang = useStore((s) => s.settings?.language ?? 'en')
  const hasAccounts = useStore((s) => !!s.auth?.hasAccounts)
  const [mode, setMode] = useState<Mode>(hasAccounts ? 'signin' : 'signup')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (m: Mode) => { setMode(m); setError(''); setPassword(''); setConfirm('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if (mode === 'signup' && password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const auth = mode === 'signup'
        ? await invoke<AuthStatus>('auth:register', { username, email, password, remember })
        : await invoke<AuthStatus>('auth:login', { identifier, password, remember })
      setPassword(''); setConfirm('')
      useStore.setState({ auth })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setLang = (l: 'en' | 'fr') => invoke<Settings>('settings:set', { language: l }).then((s) => useStore.setState({ settings: s })).catch(() => {})
  const level = strength(password)
  const levelLabel = ['', t('Weak'), t('Fair'), t('Strong')][level]
  const levelColor = ['bg-line', 'bg-del', 'bg-warn', 'bg-accent'][level]

  return (
    <div className="fixed inset-0 z-[390] bg-app text-fg flex" role="dialog" aria-modal="true" aria-label={mode === 'signup' ? t('Create your account') : t('Sign in')}>
      <div className="drag absolute top-0 inset-x-0 h-10" />
      <div className="w-[42%] shrink-0 hero-panel hidden md:flex flex-col justify-between p-12 relative overflow-hidden">
        <Logo size={20} />
        <div>
          <div className="text-[44px] leading-[1.02] font-medium tracking-[-0.04em]">PTR AI</div>
          <p className="mt-4 text-[18px] opacity-80 tracking-tight">{t('tagline')}</p>
        </div>
        <div className="text-[12.5px] opacity-60 max-w-[320px]">{t('Passwords are stored as a salted hash on this computer, never in clear text.')}</div>
      </div>

      <div className="flex-1 flex flex-col px-10 pt-14 pb-8 min-w-0 overflow-y-auto">
        <div className="flex justify-end gap-1 no-drag">
          {(['en', 'fr'] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`h-6 px-2 rounded text-2xs mono ${lang === l ? 'bg-bg3 text-fg' : 'text-fg3'}`}>{l.toUpperCase()}</button>
          ))}
        </div>

        <form onSubmit={submit} className="no-drag m-auto w-full max-w-[400px] py-6">
          <h1 className="text-[34px] leading-tight font-medium tracking-[-0.03em]">{mode === 'signup' ? t('Create your account') : t('Sign in')}</h1>
          <p className="text-[13.5px] text-fg2 mt-1.5 mb-7">{mode === 'signup' ? t('Create an account to start using PTR AI. It is stored only on this computer.') : t('Sign in to continue to PTR AI.')}</p>

          <div className="grid gap-4">
            {mode === 'signup' ? (
              <>
                <label className="grid gap-1.5 text-[12.5px] text-fg2">{t('Username')}
                  <input className="field h-10" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} required />
                </label>
                <label className="grid gap-1.5 text-[12.5px] text-fg2">{t('Email')}
                  <input className="field h-10" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
                </label>
              </>
            ) : (
              <label className="grid gap-1.5 text-[12.5px] text-fg2">{t('Username or email')}
                <input className="field h-10" autoFocus autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} maxLength={254} required />
              </label>
            )}

            <label className="grid gap-1.5 text-[12.5px] text-fg2">{t('Password')}
              <div className="relative">
                <input className="field h-10 pr-10" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} required />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t('Hide password') : t('Show password')} title={show ? t('Hide password') : t('Show password')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded text-fg3 hover:text-fg">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              {mode === 'signup' && password && (
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex gap-1 flex-1">{[1, 2, 3].map((i) => <div key={i} className={`h-[3px] flex-1 rounded-full ${i <= level ? levelColor : 'bg-line'}`} />)}</div>
                  <span className="text-2xs text-fg3 mono">{levelLabel}</span>
                </div>
              )}
            </label>

            {mode === 'signup' && (
              <label className="grid gap-1.5 text-[12.5px] text-fg2">{t('Confirm password')}
                <input className="field h-10" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={200} required />
              </label>
            )}

            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer w-fit">
              <input type="checkbox" className="w-4 h-4 accent-[#3b82f6]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              {t('Stay signed in on this computer')}
            </label>
          </div>

          {error && <div role="alert" className="selectable mt-4 rounded-lg border border-del/50 px-3 py-2 text-[12.5px] text-del">{t(error)}</div>}

          <button type="submit" disabled={busy} className="btn-primary h-11 w-full mt-6 text-[14px] justify-center">
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {mode === 'signup' ? t('Create account') : t('Sign in')} {!busy && <ArrowRight size={15} />}
          </button>

          <div className="mt-5 text-[13px] text-fg2 text-center">
            {mode === 'signup' ? t('Already have an account?') : t('No account yet?')}{' '}
            <button type="button" className="text-fg underline underline-offset-2 hover:opacity-80" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? t('Sign in') : t('Sign up')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
