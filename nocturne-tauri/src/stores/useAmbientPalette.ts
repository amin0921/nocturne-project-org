import { useEffect, useState } from 'react'
import { usePlayerStore } from './usePlayerStore'
import { resolveCoverUrl } from '../utils/cover-url'
import { DEFAULT_PALETTE, extractPaletteFromImage, AmbientPalette } from '../utils/colorExtractor'

/**
 * useAmbientPalette — reactive adaptive glow colors for the active track.
 * Reads currentTrack from the player store, samples its cover art through the
 * cached canvas extractor, and exposes { primary, secondary } to CenterIsland
 * and AmbientGlow. Falls back to the Nocturne signature palette (amber/blue)
 * when the track has no art or extraction fails. Race-safe on fast skips:
 * stale extractions are discarded via the cancelled flag.
 */
export function useAmbientPalette(): AmbientPalette {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const coverSrc = resolveCoverUrl(currentTrack?.coverUrl)
  const [palette, setPalette] = useState<AmbientPalette>(DEFAULT_PALETTE)

  useEffect(() => {
    let cancelled = false

    if (!coverSrc) {
      // No artwork: restore signature amber/blue immediately (same object
      // identity as current default state, so React bails out when unchanged).
      setPalette(DEFAULT_PALETTE)
      return
    }

    // Keep the previous palette visible until the new one resolves — the
    // AmbientGlow cross-fades on the swap with zero flicker.
    extractPaletteFromImage(coverSrc).then((next) => {
      if (!cancelled) setPalette(next)
    })

    return () => {
      cancelled = true
    }
  }, [coverSrc, currentTrack?.id])

  return palette
}

export default useAmbientPalette
