import { Children, useCallback, useRef, useState, type ReactNode } from 'react'
import { useStore, actions } from '../lib/store'

/**
 * Two-pane resizable split. `initial` is the size of the first pane, or of the second when `secondary` is set.
 * Sizes persist per project.
 */
export function Split({ id, children, direction = 'horizontal', initial, min = 120, secondary = false }: { id: string; children: ReactNode; direction?: 'horizontal' | 'vertical'; initial: number; min?: number; secondary?: boolean }) {
  const saved = useStore((s) => s.projects.find((p) => p.id === s.projectId)?.layout?.sizes?.[id])
  const [size, setSize] = useState<number>(saved ?? initial)
  const [collapsed, setCollapsed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [a, b] = Children.toArray(children)
  const horiz = direction === 'horizontal'

  const onDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const box = ref.current!.getBoundingClientRect()
    let last = size
    const move = (ev: PointerEvent) => {
      const total = horiz ? box.width : box.height
      const pos = horiz ? ev.clientX - box.left : ev.clientY - box.top
      const v = Math.max(min, Math.min(total - min, secondary ? total - pos : pos))
      last = v
      setSize(v)
      setCollapsed(false)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); actions.savePanelSize(id, Math.round(last)) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [size, horiz, min, secondary, id])

  const fixed = collapsed ? 0 : size
  // The fixed pane never takes more than (container − min), so the flexible pane can't collapse.
  const cap = `calc(100% - ${min}px)`
  const fixedStyle = horiz ? { width: fixed, maxWidth: cap } : { height: fixed, maxHeight: cap }
  return (
    <div ref={ref} className={`h-full w-full flex ${horiz ? 'flex-row' : 'flex-col'} min-w-0 min-h-0`}>
      <div className={`min-w-0 min-h-0 overflow-hidden ${secondary ? 'flex-1' : 'shrink-0'}`} style={secondary ? undefined : fixedStyle}>{a}</div>
      <div
        role="separator" aria-orientation={horiz ? 'vertical' : 'horizontal'} tabIndex={0}
        onPointerDown={onDown} onDoubleClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => { if (e.key === 'Enter') setCollapsed((c) => !c) }}
        title="Drag to resize · double-click to collapse"
        className={`shrink-0 bg-line hover:bg-fg3 transition-colors ${horiz ? 'w-px cursor-col-resize hover:w-[3px]' : 'h-px cursor-row-resize hover:h-[3px]'}`}
      />
      <div className={`min-w-0 min-h-0 overflow-hidden ${secondary ? 'shrink-0' : 'flex-1'}`} style={secondary ? fixedStyle : undefined}>{b}</div>
    </div>
  )
}
