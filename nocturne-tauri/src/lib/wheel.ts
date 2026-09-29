/**
 * Wheel-delta normalization for the two wheel-sensitive controls
 * (the waveform scrubber and the volume capsule).
 *
 * NOCTURNE_RULE — Windows must feel EXACTLY as it always did.
 *
 *   if (!IS_MACOS || magnitude >= WHEEL_NOTCH_PX) return direction * step
 *
 * That first line is the whole guarantee. On Windows `IS_MACOS` is false, so
 * EVERY wheel event — whatever its magnitude or deltaMode — takes that branch
 * and returns the same `sign * step` constant the components hard-coded before.
 * The scaled and momentum-damped branches below are unreachable on Windows.
 *
 * On macOS the situation is the opposite. A trackpad does not emit one event
 * per notch: a two-finger flick emits dozens of small deltas (1-15px) plus a
 * momentum tail after the fingers lift. Feeding those to a fixed step made the
 * playhead jump 30-90s and the volume slam 0<->100, so macOS gets a
 * magnitude-proportional step and a damping factor for the tail.
 */

import { IS_MACOS } from './platform'

/**
 * A discrete mouse notch arrives as ~120px. Anything at or above this is one
 * full notch. Deliberately below 120 so a Windows notch never falls through.
 */
const WHEEL_NOTCH_PX = 100

/** Floor on the proportional factor so a very light touch still moves. */
const MIN_NOTCH_FRACTION = 0.15

/**
 * Momentum events arrive with widening inter-event gaps (active two-finger
 * scrolling is roughly 16-60ms apart; the decaying tail spreads out past that).
 */
const MOMENTUM_GAP_MS = 60

/** Scale applied once an event is classified as momentum, so it coasts to a stop. */
const MOMENTUM_DAMPING = 0.25

/**
 * Convert to a pixel-equivalent delta.
 * deltaMode 0 = pixel (both WebView2 and WKWebView), 1 = line, 2 = page.
 */
function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 16
  if (e.deltaMode === 2) return e.deltaY * 400
  return e.deltaY
}

export interface WheelStep {
  /** Signed delta to apply: positive means forward. */
  step: number
  /** True when this event was classified as trackpad momentum. */
  momentum: boolean
}

/**
 * Resolve one wheel event into a signed step.
 *
 * @param e       the raw wheel event
 * @param step    the per-notch step for this control (seconds, or volume %)
 * @param lastAt  `performance.now()` of the previously handled wheel event, or 0
 */
export function normalizeWheelStep(e: WheelEvent, step: number, lastAt: number): WheelStep {
  const px = wheelPixels(e)
  const direction = px < 0 ? 1 : -1
  const magnitude = Math.abs(px)

  // --- Windows, and any single discrete notch: unchanged, always. ---
  if (!IS_MACOS || magnitude >= WHEEL_NOTCH_PX) {
    return { step: direction * step, momentum: false }
  }

  // --- macOS trackpad: scale by magnitude, damp the momentum tail. ---
  const now = performance.now()
  const momentum = lastAt > 0 && now - lastAt > MOMENTUM_GAP_MS
  const damp = momentum ? MOMENTUM_DAMPING : 1
  const notches = Math.min(1, Math.max(MIN_NOTCH_FRACTION, magnitude / WHEEL_NOTCH_PX))
  return { step: direction * step * notches * damp, momentum }
}
