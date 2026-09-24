import React, { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

/* Procedural mappings — musical-breath undulation while playing. */
const R_MIN = 330
const R_MAX = 410
const O_MIN = 0.3
const O_MAX = 0.55
const H_BASE = 42
const H_DRIFT = 4
/* Beat cadence: a gentle scale punch every ~1.2–1.6s. */
const BEAT_MIN_MS = 1200
const BEAT_JITTER_MS = 400
const PULSE_DURATION_MS = 220 // ~40ms attack + 180ms ease-out decay

export interface AmberBreathProps {
  /** True while audio plays — starts/stops the procedural pulse loop. */
  playing: boolean
  className?: string
}

/** WAAPI kick: 1.00 → 1.025 punch with a 180ms ease-out settle. */
const PULSE_FRAMES: Keyframe[] = [
  { transform: 'translate(-50%, -50%) scale(1)', offset: 0 },
  { transform: 'translate(-50%, -50%) scale(1.025)', offset: 0.18 },
  { transform: 'translate(-50%, -50%) scale(1)', offset: 1 }
]

/**
 * AmberBreath — procedural organic stage aura (Step 94).
 *
 * Pure client-side motion: NO Web Audio, NO analyser, NO media interception —
 * the singleton HTMLAudioElement keeps its direct hardware output untouched.
 *
 * - `playing={false}`: the rAF loop is cancelled immediately (0% JS CPU) and
 *   the `.idle` class hands the element to the pure-CSS 6s sine breathing
 *   rhythm (`@keyframes breathe`).
 * - `playing={true}`: a lightweight compositor-friendly rAF loop drives
 *   `--glow-r` (330–410px), `--glow-o` (0.30–0.55) and `--glow-h` (42°±4°)
 *   from organic sin/cos undulation, plus a WAAPI scale punch every
 *   ~1.2–1.6s. CSS variables are written straight to the element ref —
 *   ZERO React state re-renders per frame.
 * - `prefers-reduced-motion`: loop never starts; a serene static 30% glow.
 * - Window-transparency invariant: dispersion is baked into the
 *   radial-gradient stops — zero box-shadow, zero CSS blur filters.
 */
export function AmberBreath({ playing, className }: AmberBreathProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const glow = rootRef.current
    if (!glow) return

    // Paused / reduced-motion: no loop at all — CSS owns the motion.
    if (!playing) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      glow.style.setProperty('--glow-r', '340px')
      glow.style.setProperty('--glow-o', '0.3')
      glow.style.setProperty('--glow-h', `${H_BASE}deg`)
      return
    }

    let rafId = 0
    let pulse: Animation | null = null
    let nextBeat = 0

    const setVars = (r: number, o: number, h: number): void => {
      glow.style.setProperty('--glow-r', `${Math.round(r)}px`)
      glow.style.setProperty('--glow-o', o.toFixed(3))
      glow.style.setProperty('--glow-h', `${h.toFixed(2)}deg`)
    }

    const frame = (now: number): void => {
      rafId = requestAnimationFrame(frame)
      const t = now / 1000

      // Organic musical breath: two out-of-phase waves (1.8 / 0.9 rad·s⁻¹).
      const breath = Math.sin(t * 1.8) * 0.5 + 0.5 // 0..1
      const swell = Math.cos(t * 0.9) * 0.5 + 0.5 // 0..1
      const bass = breath * 0.65 + swell * 0.35
      const lumen = breath * 0.45 + swell * 0.55

      setVars(
        R_MIN + (R_MAX - R_MIN) * bass,
        O_MIN + (O_MAX - O_MIN) * lumen,
        H_BASE + Math.sin(t * 0.7) * H_DRIFT
      )

      // Cadenced kick pulse: gentle 1.00 → 1.025 punch, 180ms ease-out decay.
      if (now >= nextBeat) {
        nextBeat = now + BEAT_MIN_MS + Math.random() * BEAT_JITTER_MS
        pulse?.cancel()
        pulse = glow.animate(PULSE_FRAMES, {
          duration: PULSE_DURATION_MS,
          easing: 'ease-out'
        })
      }
    }

    nextBeat = performance.now() + BEAT_MIN_MS + Math.random() * BEAT_JITTER_MS
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      pulse?.cancel()
      pulse = null
    }
  }, [playing])

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn('amber-breath', !playing && 'idle', className)}
    />
  )
}

export default AmberBreath
