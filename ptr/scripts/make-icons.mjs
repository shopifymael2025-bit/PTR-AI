// Generates the PTR AI logo assets (SVG, PNG, ICO) from the PTR AI wordmark in src/shared/logo.json.
// Pure Node: polygon rasterizer (even-odd) with 4×4 supersampling + a minimal PNG encoder.
// Sizes ≥ 48 px show the full wordmark; 16–32 px show the "P" glyph alone (a wordmark is unreadable that small).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const logo = JSON.parse(fs.readFileSync(path.resolve('src/shared/logo.json'), 'utf8'))
const W = logo.width, H = logo.height
const glyphD = (g) => g.map((s) => 'M' + s.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z').join(' ')
const inPoly = (x, y, p) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r } return r }
const inGlyphs = (glyphs, x, y) => glyphs.some((g) => g.filter((p) => inPoly(x, y, p)).length % 2 === 1)

// Two marks: full wordmark, and the P alone (glyph 0 spans x 0..84).
const MARKS = {
  word: { glyphs: logo.glyphs, w: W, h: H },
  o: { glyphs: [logo.glyphs[0]], w: 84, h: H }
}
// Fit a mark into the 256 icon square with a margin, centered.
function place(mark, inner) { const s = inner / Math.max(mark.w, mark.h); return { s, ox: (256 - mark.w * s) / 2, oy: (256 - mark.h * s) / 2 } }
const LAYOUT = { word: place(MARKS.word, 196), o: place(MARKS.o, 120) }

const out = path.resolve('build'); const assets = path.resolve('assets')
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(assets, { recursive: true })

// Dark blue gradient (top-left → bottom-right) for the app icon; light variant stays flat.
const DARK = { fg: [234, 240, 255], bg: [[30, 64, 175], [6, 10, 30]] }, LIGHT = { fg: [17, 17, 17], bg: [250, 250, 250] }
// --- SVGs ---
const paths = (mark, fg) => mark.glyphs.map((g) => `<path fill-rule="evenodd" d="${glyphD(g)}" fill="${fg}"/>`).join('')
const word = (fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${paths(MARKS.word, fg)}</svg>\n`
const hex = (c) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('')
const icon = (fg, bg, kind = 'word') => { const L = LAYOUT[kind]; const grad = Array.isArray(bg[0]); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${grad ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hex(bg[0])}"/><stop offset="1" stop-color="${hex(bg[1])}"/></linearGradient></defs>` : ''}<rect width="256" height="256" rx="56" fill="${grad ? 'url(#g)' : bg}"/><g transform="translate(${L.ox} ${L.oy}) scale(${L.s})">${paths(MARKS[kind], fg)}</g></svg>\n` }
for (const f of fs.readdirSync(assets)) if (/^(logo|icon)/.test(f)) fs.rmSync(path.join(assets, f))
fs.writeFileSync(path.join(assets, 'logo.svg'), word('currentColor'))
fs.writeFileSync(path.join(assets, 'logo-dark.svg'), word('#EAF0FF')) // for dark backgrounds
fs.writeFileSync(path.join(assets, 'logo-light.svg'), word('#111111')) // for light backgrounds
fs.writeFileSync(path.join(assets, 'icon-dark.svg'), icon('#EAF0FF', DARK.bg))
fs.writeFileSync(path.join(assets, 'icon-light.svg'), icon('#111111', '#FAFAFA'))
fs.writeFileSync(path.join(assets, 'icon-small-dark.svg'), icon('#EAF0FF', DARK.bg, 'o'))

// --- raster ---
function render(size, fg, bg, kind) {
  const px = Buffer.alloc(size * size * 4)
  const ss = 4, radius = 56, L = LAYOUT[kind], glyphs = MARKS[kind].glyphs
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cover = 0, inBg = 0
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = ((x + (sx + 0.5) / ss) / size) * 256, v = ((y + (sy + 0.5) / ss) / size) * 256
      const cx = Math.min(Math.max(u, radius), 256 - radius), cy = Math.min(Math.max(v, radius), 256 - radius)
      if ((u - cx) ** 2 + (v - cy) ** 2 > radius * radius) continue
      inBg++
      if (inGlyphs(glyphs, (u - L.ox) / L.s, (v - L.oy) / L.s)) cover++
    }
    const a = inBg / (ss * ss), m = inBg ? cover / inBg : 0, i = (y * size + x) * 4
    const t = (x + y) / (2 * size), b = Array.isArray(bg[0]) ? [0, 1, 2].map((c) => bg[0][c] + (bg[1][c] - bg[0][c]) * t) : bg
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(b[c] * (1 - m) + fg[c] * m)
    px[i + 3] = Math.round(a * 255)
  }
  return px
}
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c } return (crc ^ 0xffffffff) >>> 0 }
function png(size, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
const kindFor = (s) => (s <= 32 ? 'o' : 'word')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = sizes.map((s) => png(s, render(s, DARK.fg, DARK.bg, kindFor(s))))
// 1024 px PNG: electron-builder derives the macOS .icns from it.
fs.writeFileSync(path.join(out, 'icon.png'), png(1024, render(1024, DARK.fg, DARK.bg, 'word')))
fs.writeFileSync(path.join(assets, 'icon-dark-512.png'), png(512, render(512, DARK.fg, DARK.bg, 'word')))
fs.writeFileSync(path.join(assets, 'icon-light-512.png'), png(512, render(512, LIGHT.fg, LIGHT.bg, 'word')))
fs.writeFileSync(path.join(assets, 'icon-small-32.png'), png(32, render(32, DARK.fg, DARK.bg, 'o')))

// ICO with embedded PNG images (supported since Windows Vista).
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const entries = sizes.map((s, i) => { const e = Buffer.alloc(16); e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12); offset += pngs[i].length; return e })
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]))
console.log('Icons written to build/ and assets/')
