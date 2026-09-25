import { useLayoutEffect, useRef, useState } from 'react'

/**
 * useTrackSwapFade
 *
 * Returns 1 while the keyed content is visible and 0 during the short hide
 * window that opens whenever `key` (a track identity) changes.
 *
 * Split-stage track-swap helper: the state flips to 0 inside a layout effect —
 * before the browser paints the new track — so the content swap (cover src,
 * lyrics payload, metadata) is never seen mid-flight. Consumers combine the
 * returned value with their own opacity transition to fade the new content
 * into place WITHOUT remounting the island or artwork subtree (a remount in
 * the same paint frame as the swap is the documented cause of the split-stage
 * hitch).
 *
 * Rapid consecutive skips keep the content hidden and only reveal it once the
 * user stops skipping (one reveal timer per key change).
 * Honors prefers-reduced-motion: content is never hidden.
 */
export function useTrackSwapFade(
  key: string | number | null | undefined,
  revealDelayMs = 90
): number {
  const [visible, setVisible] = useState(1)
  const prevKeyRef = useRef(key)

  useLayoutEffect(() => {
    if (prevKeyRef.current === key) return
    prevKeyRef.current = key

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    setVisible(0)
    const timer = window.setTimeout(() => setVisible(1), revealDelayMs)
    return () => window.clearTimeout(timer)
  }, [key, revealDelayMs])

  return visible
}

export default useTrackSwapFade
