import { useEffect, useRef } from 'react'

export interface SpringConfig {
  /** Oscillator stiffness (spring pull strength). Default 320. */
  stiffness?: number
  /** Velocity damping. Default 28. */
  damping?: number
  /** Moving mass. Default 1. */
  mass?: number
}

/**
 * Zero-dependency semi-implicit Euler spring — Nocturne's unified motion
 * primitive (luxury micro-interactions §0).
 *
 * - Animates a scalar toward `target` at 60fps via requestAnimationFrame.
 * - Reports every settled frame through `onUpdate` for DIRECT DOM writes
 *   (CSS custom properties) — zero React re-renders per frame.
 * - Integration is semi-implicit Euler, substepped ×2 for stability at high
 *   stiffness values.
 * - `prefers-reduced-motion: reduce` snaps instantly to the target and never
 *   starts the rAF loop.
 */
export function useSpring(
  target: number,
  onUpdate: (value: number) => void,
  config: SpringConfig = {}
): void {
  const { stiffness = 320, damping = 28, mass = 1 } = config

  const targetRef = useRef(target)
  const onUpdateRef = useRef(onUpdate)
  const stateRef = useRef({ value: target, velocity: 0 })
  const reducedRef = useRef(false)

  onUpdateRef.current = onUpdate

  useEffect(() => {
    reducedRef.current =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    targetRef.current = target
    if (reducedRef.current) {
      stateRef.current.value = target
      stateRef.current.velocity = 0
      onUpdateRef.current(target)
    }
  }, [target])

  useEffect(() => {
    if (reducedRef.current) return

    let rafId = 0
    let last = performance.now()
    let lastPaint = Number.NaN

    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.064)
      last = now

      const s = stateRef.current
      const t = targetRef.current

      // Semi-implicit Euler, ×2 substeps for high-stiffness stability.
      const h = dt / 2
      for (let i = 0; i < 2; i++) {
        const accel = (stiffness * (t - s.value) - damping * s.velocity) / mass
        s.velocity += accel * h
        s.value += s.velocity * h
      }

      // Settle snap: avoid infinite micro-oscillation at the target.
      if (Math.abs(t - s.value) < 0.02 && Math.abs(s.velocity) < 0.05) {
        s.value = t
        s.velocity = 0
      }

      if (s.value !== lastPaint) {
        lastPaint = s.value
        onUpdateRef.current(s.value)
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [stiffness, damping, mass])
}
