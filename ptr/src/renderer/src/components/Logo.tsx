import { useMemo } from 'react'
import { asciiLogo, glyphPaths, LOGO_H, LOGO_W } from '@shared/logo'

const PATHS = glyphPaths()
/** PTR AI wordmark. `size` is the height in px; width follows the wordmark's proportions. */
export function Logo({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg height={size} width={(size * LOGO_W) / LOGO_H} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} className={className} aria-label="PTR AI" role="img">
      {PATHS.map((d, i) => <path key={i} d={d} fill="currentColor" fillRule="evenodd" />)}
    </svg>
  )
}

const ASCII = asciiLogo()
export function AsciiLogo({ className = '' }: { className?: string }) {
  // line-height 1 so the half-blocks of consecutive lines join without gaps
  // Windows' Cascadia Mono / Consolas draw block glyphs edge to edge (no seams); line-height 1 joins the rows.
  return <pre aria-hidden style={{ fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace", lineHeight: 1, letterSpacing: 0 }} className={`text-[11px] text-fg select-none ${className}`}>{ASCII}</pre>
}

/**
 * Opening animation of the wordmark: every block lights up with a blue flash in a left-to-right wave
 * (delay = column + row + a little deterministic jitter), then settles into the normal colour.
 * With animate=false it renders exactly like AsciiLogo.
 */
export function IntroLogo({ className = '', animate = true }: { className?: string; animate?: boolean }) {
  const rows = useMemo(() => ASCII.split('\n'), [])
  return (
    <pre aria-label="PTR AI" role="img" style={{ fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace", lineHeight: 1, letterSpacing: 0 }} className={`text-[11px] text-fg select-none ${className}`}>
      {rows.map((line, r) => (
        <span key={r}>
          {[...line].map((ch, c) => {
            if (ch === ' ' || !animate) return ch
            const jitter = ((c * 37 + r * 91) % 11) * 9 // 0–90 ms, stable between renders
            return <span key={c} className="intro-px" style={{ ['--d' as string]: `${c * 16 + r * 20 + jitter}ms` }}>{ch}</span>
          })}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
