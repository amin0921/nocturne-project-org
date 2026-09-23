/**
 * colorExtractor — ultra-lightweight adaptive artwork palette sampling.
 * Vanilla HTML5 Canvas only: a 24x24 offscreen downsample plus a quantized
 * RGB histogram. Zero external dependencies. Canvas is used exactly once per
 * image (never per frame); results are cached by imageSrc in memory.
 */

export interface AmbientPalette {
  primary: string
  secondary: string
}

/** Nocturne signature defaults: ember amber + subtle studio blue. Treat as immutable. */
export const DEFAULT_PALETTE: AmbientPalette = {
  primary: '#EAB308',
  secondary: '#3B82F6'
}

const SAMPLE_SIZE = 24
const NEAR_BLACK = 25
const NEAR_WHITE = 240
/** Min RGB euclidean distance for the secondary tone to count as an accent. */
const SECONDARY_DISTANCE = 70
const LOAD_TIMEOUT_MS = 8000
/** +25% chroma boost (inside the +20%..+30% band) so sampled tones stay vivid, never muddy. */
const SATURATION_BOOST = 1.25

const paletteCache = new Map<string, AmbientPalette>()

interface RGB {
  r: number
  g: number
  b: number
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

function parseHex(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ]
}

/** Push HSL saturation by `factor` (clamped to 1) while preserving hue and lightness. */
function boostSaturation(rgb: RGB, factor: number): RGB {
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const [r, g, b] = hslToRgb(h, Math.min(1, s * factor), l)
  return { r, g, b }
}

/** Complementary hue (rotated +180deg) used when artwork is fully monochrome. */
function complementHex(hex: string): string {
  const { r, g, b } = parseHex(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [nr, ng, nb] = hslToRgb((h + 0.5) % 1, s, l)
  return toHex(nr, ng, nb)
}

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      img.src = ''
      reject(new Error('palette: image load timeout'))
    }, LOAD_TIMEOUT_MS)
    img.onload = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      reject(new Error('palette: image load failed'))
    }
    img.src = src
  })
}

/**
 * Load strategies (asset protocol responses include Access-Control-Allow-Origin,
 * so both paths yield an untainted, canvas-readable bitmap):
 * 1. fetch -> blob -> objectURL (same-origin, guaranteed clean).
 * 2. Direct <img crossOrigin="anonymous"> (CORS-approved by Tauri's asset protocol).
 */
async function loadImageForSampling(src: string): Promise<HTMLImageElement> {
  try {
    const res = await fetch(src)
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      try {
        return await loadImage(url, false)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  } catch {
    // fall through to direct CORS image load
  }
  return loadImage(src, true)
}

/** Draw at 24x24 and build a quantized histogram of rich (non-black/white) tones. */
function samplePalette(img: HTMLImageElement): AmbientPalette | null {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  try {
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  } catch {
    return null
  }

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
  } catch {
    // Tainted canvas (should not happen with CORS-clean loads) — safe fallback.
    return null
  }

  // Quantize to 16 levels per channel (4096 buckets), accumulate sums per bucket.
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const brightness = (r + g + b) / 3
    // Filter near-black and near-white noise to keep rich, saturated musical tones.
    if (brightness < NEAR_BLACK || brightness > NEAR_WHITE) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n += 1
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  if (buckets.size === 0) return null

  const ranked = [...buckets.values()]
    .map((t) => ({ r: t.r / t.n, g: t.g / t.n, b: t.b / t.n, n: t.n }))
    .sort((x, y) => y.n - x.n)

  const primary = ranked[0]
  const accent = ranked.find((c) => colorDistance(primary, c) > SECONDARY_DISTANCE)

  const primaryBoosted = boostSaturation(primary, SATURATION_BOOST)
  const primaryHex = toHex(primaryBoosted.r, primaryBoosted.g, primaryBoosted.b)
  const secondarySource = accent ?? (ranked.length > 1 ? ranked[1] : null)
  const secondaryHex = secondarySource
    ? (() => {
        const c = boostSaturation(secondarySource, SATURATION_BOOST)
        return toHex(c.r, c.g, c.b)
      })()
    : complementHex(primaryHex)

  return { primary: primaryHex, secondary: secondaryHex }
}

/**
 * Extract a dominant primary and secondary accent palette from cover art.
 * - Samples a 24x24 offscreen canvas (single pass, sub-millisecond histogram).
 * - Filters near-black (rgb < 25 avg) and near-white (rgb > 240 avg) noise.
 * - Applies a +25% HSL saturation boost to both tones so the aura reads vivid
 *   against the obsidian stage instead of muddy/gray.
 * - Returns Nocturne defaults (#EAB308 / #3B82F6) on missing art or any failure.
 * - Caches successful results by imageSrc for queue replays.
 */
export async function extractPaletteFromImage(imageSrc: string): Promise<AmbientPalette> {
  if (typeof imageSrc !== 'string' || !imageSrc.trim()) return DEFAULT_PALETTE
  const src = imageSrc.trim()
  const cached = paletteCache.get(src)
  if (cached) return cached
  try {
    const img = await loadImageForSampling(src)
    const palette = samplePalette(img)
    if (!palette) return DEFAULT_PALETTE
    paletteCache.set(src, palette)
    return palette
  } catch {
    return DEFAULT_PALETTE
  }
}

export default extractPaletteFromImage
