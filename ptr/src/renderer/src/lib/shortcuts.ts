/** True when running on macOS (shortcuts use ⌘, native window buttons, zsh terminal). */
export const IS_MAC = typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent)

/**
 * Shortcuts are stored with "Ctrl"; on macOS "Ctrl" means the ⌘ Command key, like every Mac app.
 */
export function matchShortcut(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.toLowerCase().split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]
  const wantCtrl = parts.includes('ctrl')
  const primary = IS_MAC ? e.metaKey : e.ctrlKey
  const other = IS_MAC ? e.ctrlKey : e.metaKey
  if (primary !== wantCtrl || other || e.shiftKey !== parts.includes('shift') || e.altKey !== parts.includes('alt')) return false
  return e.key.toLowerCase() === key || e.code.toLowerCase() === `key${key}`
}

export function eventToShortcut(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const p: string[] = []
  if (IS_MAC ? e.metaKey : e.ctrlKey) p.push('Ctrl')
  if (e.shiftKey) p.push('Shift')
  if (e.altKey) p.push('Alt')
  if (!p.length) return null
  p.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return p.join('+')
}

/** Human label for a stored shortcut: "Ctrl+Shift+P" → "⌘⇧P" on macOS. */
export function shortcutLabel(spec: string): string {
  if (!IS_MAC) return spec
  return spec.replace(/Ctrl\+?/g, '⌘').replace(/Shift\+?/g, '⇧').replace(/Alt\+?/g, '⌥')
}
