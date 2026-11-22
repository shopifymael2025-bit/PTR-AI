import { useMemo } from 'react'
import { diffLines } from 'diff'

export function diffStats(before: string, after: string) {
  let added = 0, removed = 0
  for (const p of diffLines(before.replace(/\r\n/g, '\n'), after.replace(/\r\n/g, '\n'))) {
    if (p.added) added += p.count ?? 0
    else if (p.removed) removed += p.count ?? 0
  }
  return { added, removed }
}

/** Compact unified diff with collapsed unchanged regions. */
export function InlineDiff({ before, after, maxHeight = 360 }: { before: string; after: string; maxHeight?: number }) {
  const rows = useMemo(() => {
    const parts = diffLines(before.replace(/\r\n/g, '\n'), after.replace(/\r\n/g, '\n'))
    const out: { kind: '+' | '-' | ' ' | '…'; text: string; a?: number; b?: number }[] = []
    let a = 1, b = 1
    parts.forEach((p, idx) => {
      const lines = p.value.replace(/\n$/, '').split('\n')
      if (p.added) lines.forEach((l) => out.push({ kind: '+', text: l, b: b++ }))
      else if (p.removed) lines.forEach((l) => out.push({ kind: '-', text: l, a: a++ }))
      else {
        const ctx = 3
        const first = idx === 0, last = idx === parts.length - 1
        if (lines.length > ctx * 2 + 1 || ((first || last) && lines.length > ctx)) {
          const head = first ? [] : lines.slice(0, ctx)
          const tail = last ? [] : lines.slice(-ctx)
          head.forEach((l) => out.push({ kind: ' ', text: l, a: a++, b: b++ }))
          const skipped = lines.length - head.length - tail.length
          out.push({ kind: '…', text: `${skipped} unchanged lines` }); a += skipped; b += skipped
          tail.forEach((l) => out.push({ kind: ' ', text: l, a: a++, b: b++ }))
        } else lines.forEach((l) => out.push({ kind: ' ', text: l, a: a++, b: b++ }))
      }
    })
    return out
  }, [before, after])

  return (
    <div className="overflow-auto mono text-[12px] leading-[1.55] selectable" style={{ maxHeight }}>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((r, i) => r.kind === '…' ? (
            <tr key={i}><td colSpan={3} className="px-3 py-0.5 text-fg3 bg-bg text-2xs">⋯ {r.text}</td></tr>
          ) : (
            <tr key={i} style={{ background: r.kind === '+' ? 'var(--add-bg)' : r.kind === '-' ? 'var(--del-bg)' : undefined }}>
              <td className="w-10 text-right pr-2 text-fg3 select-none align-top">{r.kind === '+' ? '' : r.a}</td>
              <td className="w-10 text-right pr-2 text-fg3 select-none align-top">{r.kind === '-' ? '' : r.b}</td>
              <td className="whitespace-pre pr-4"><span className={`select-none inline-block w-4 ${r.kind === '+' ? 'text-add' : r.kind === '-' ? 'text-del' : 'text-fg3'}`}>{r.kind}</span>{r.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
