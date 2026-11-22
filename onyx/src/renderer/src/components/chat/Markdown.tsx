import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy, FileInput, Play, Eye } from 'lucide-react'
import { useStore, actions, askText } from '../../lib/store'
import { canRunSnippet, runSnippet } from '../../lib/run'
import { invoke } from '../../lib/api'
import { useT } from '../../lib/i18n'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

function CodeBlock({ lang, children }: { lang: string; children: ReactNode }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const projectId = useStore((s) => s.projectId)
  const code = textOf(children).replace(/\n$/, '')
  const pathHint = code.split('\n')[0].match(/^\s*(?:\/\/|#|--|<!--|\/\*)\s*(?:path|file(?:name)?):\s*([^\s*>]+)/i)?.[1]

  const apply = async () => {
    // No project yet: let the user pick one (or open a folder); the conversation moves into it.
    const pid = projectId ?? (await actions.ensureProject())
    if (!pid) return
    const target = (await askText(t('Apply to file (path relative to the project root):'), pathHint ?? ''))?.trim()
    if (!target) return
    const existing = await invoke<{ content: string }>('fs:read', { projectId: pid, path: target }).catch(() => null)
    const body = pathHint ? code.split('\n').slice(1).join('\n') : code
    actions.showDiff(target, existing?.content ?? '', body)
  }

  return (
    <div className="my-3 rounded-xl border border-line bg-bg2 overflow-hidden not-prose">
      <div className="h-8 px-3 flex items-center gap-2 border-b border-line text-2xs text-fg3 mono">
        <span>{pathHint ?? lang ?? 'text'}</span>
        <div className="ml-auto flex gap-1">
          {canRunSnippet(lang) && (
            <button className="btn h-6 px-1.5 text-2xs" title={lang === 'html' ? t('Preview') : t('Run in terminal')} onClick={() => runSnippet(lang, pathHint ? code.split('\n').slice(1).join('\n') : code)}>
              {lang === 'html' ? <Eye size={12} /> : <Play size={12} />}{lang === 'html' ? t('Preview') : t('Run')}
            </button>
          )}
          <button className="btn h-6 px-1.5 text-2xs" onClick={apply} title={t('applyToFile')}><FileInput size={12} />{t('applyToFile')}</button>
          <button className="btn h-6 px-1.5 text-2xs" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? t('copied') : t('copy')}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-[12.5px] leading-[1.6] mono"><code className={`hljs language-${lang}`}>{children}</code></pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-ptr">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children
            const cls = (child as { props?: { className?: string } })?.props?.className ?? ''
            const lang = /language-([\w+-]+)/.exec(cls)?.[1] ?? ''
            return <CodeBlock lang={lang}>{(child as { props?: { children?: ReactNode } })?.props?.children}</CodeBlock>
          },
          a: ({ href, children }) => <a href={href} onClick={(e) => { e.preventDefault(); if (href?.startsWith('https://')) invoke('app:openExternal', href) }}>{children}</a>
        }}
      >{text}</ReactMarkdown>
    </div>
  )
})
