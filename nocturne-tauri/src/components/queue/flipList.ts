/**
 * FLIP (First, Last, Invert, Play) helper for list reordering.
 *
 * First pass (`captureFlipRects`) reads every row's viewport top BEFORE the
 * mutation; the Last/Invert/Play pass (`playFlip`) runs from a layout effect
 * AFTER React has committed the new DOM order but before paint, so rows glide
 * 260ms into their new slots with pure transform (GPU composited, no layout
 * thrash). Rows must carry a stable `data-flip="<track id>"` attribute.
 */

export type FlipRects = Map<string, number>

export const FLIP_DURATION_MS = 280
export const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function queryRows(container: HTMLElement | null | undefined): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>('[data-flip]'))
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** FIRST — call before the mutation (event handler, pre-commit). */
export function captureFlipRects(
  container: HTMLElement | null | undefined,
  excludeKey?: string
): FlipRects | null {
  const first: FlipRects = new Map()
  queryRows(container).forEach((row) => {
    const key = row.dataset.flip
    if (key && key !== excludeKey) first.set(key, row.getBoundingClientRect().top)
  })
  return first.size > 0 ? first : null
}

/** LAST + INVERT + PLAY — call after the DOM committed (layout effect). */
export function playFlip(
  container: HTMLElement | null | undefined,
  first: FlipRects | null | undefined
): void {
  if (!container || !first || first.size === 0) return
  const reduced = prefersReducedMotion()
  queryRows(container).forEach((row) => {
    const key = row.dataset.flip
    if (!key) return
    const before = first.get(key)
    if (before === undefined) return
    const dy = before - row.getBoundingClientRect().top
    if (!dy) return
    if (reduced) return
    row.style.transition = 'none'
    row.style.transform = `translateY(${dy}px)`
    requestAnimationFrame(() => {
      row.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`
      row.style.transform = ''
      window.setTimeout(() => {
        if (row.isConnected) row.style.transition = ''
      }, FLIP_DURATION_MS + 60)
    })
  })
}

/** Convenience for synchronous (non-React) mutations: capture → mutate → play. */
export function flipList(container: HTMLElement, mutate: () => void): void {
  const first = captureFlipRects(container)
  mutate()
  playFlip(container, first)
}

export default flipList
