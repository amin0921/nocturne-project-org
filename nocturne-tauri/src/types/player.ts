/**
 * Nocturne Space-Grade Shared Types and Player Utilities
 * Aligned with Nocturne UI Specifications.
 */

export interface Track {
  id: number | string
  title: string
  artist: string
  album: string
  duration?: number | null
  duration_secs?: number | null
  coverUrl?: string
  color?: string
  path?: string
  missing?: number
}

/**
 * Robust formatTime utility that guarantees Latin digits and forced LTR output.
 * Formats totalSeconds into "m:ss" (e.g. 195 -> "3:15").
 * Returns "--:--" for invalid, null, or negative seconds.
 */
export function formatTime(totalSeconds: number | null | undefined): string {
  if (
    totalSeconds === null ||
    totalSeconds === undefined ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return '--:--'
  }
  const total = Math.floor(totalSeconds)
  const minutes = Math.floor(total / 60)
  const seconds = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}
