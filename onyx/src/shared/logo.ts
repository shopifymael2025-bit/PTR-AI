// Geometry of the PTR AI wordmark (see logo.json).
import data from './logo.json'

type Poly = [number, number][]
export const LOGO_W: number = data.width
export const LOGO_H: number = data.height
const GLYPHS = data.glyphs as Poly[][]

/** One SVG path per glyph; render with fill-rule="evenodd". */
export function glyphPaths(): string[] {
  return GLYPHS.map((g) => g.map((s) => 'M' + s.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z').join(' '))
}

function inPoly(x: number, y: number, poly: Poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const inLogo = (x: number, y: number) => GLYPHS.some((g) => g.filter((p) => inPoly(x, y, p)).length % 2 === 1)

/**
 * Text rendering of the wordmark with Unicode half-blocks (█ ▀ ▄): each character holds two
 * vertical pixels, so the letters stay crisp. Pixels are sampled 3×3 and filled when ≥ half covered.
 */
export function asciiLogo(cols = 54, rows = 8): string {
  const pxRows = rows * 2
  const sx = LOGO_W / cols, sy = LOGO_H / pxRows
  const filled = (c: number, r: number) => {
    let hit = 0
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (inLogo((c + (i + 0.5) / 3) * sx, (r + (j + 0.5) / 3) * sy)) hit++
    return hit >= 5
  }
  const out: string[] = []
  for (let r = 0; r < pxRows; r += 2) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const top = filled(c, r), bottom = filled(c, r + 1)
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
    }
    out.push(line.replace(/\s+$/, ''))
  }
  return out.join('\n')
}
