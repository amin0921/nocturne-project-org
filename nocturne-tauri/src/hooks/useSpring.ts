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
 * - P0 idle-CPU fix: the loop is SELF-TERMINATING. Once the settle snap fires,
 *   the pending frame is cancelled and NOTHING further is scheduled, so a
 *   resting spring costs zero rAF wakeups instead of waking 60×/s forever. A
 *   target change restarts the loop, continuing from the current value AND
 *   velocity (so an interrupted animation never jumps).
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
  // Restart handle installed by the loop effect; the target effect calls it so
  // a settled spring resumes without remounting anything.
  const startRef = useRef<() => void>(() => {})

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
      return
    }
    // Idempotent: a running loop is already heading at the new target, and a
    // settled one has nothing to integrate — both just get their first frame
    // scheduled (or skipped, if already at rest).
    startRef.current()
  }, [target])

  useEffect(() => {
    if (reducedRef.current) return

    // 0 means "no frame pending" — the single source of truth for liveness.
    let rafId = 0
    let last = performance.now()
    let lastPaint = Number.NaN

    const stop = (): void => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const frame = (now: number): void => {
      rafId = 0
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
      const settled = Math.abs(t - s.value) < 0.02 && Math.abs(s.velocity) < 0.05
      if (settled) {
        s.value = t
        s.velocity = 0
      }

      if (s.value !== lastPaint) {
        lastPaint = s.value
        onUpdateRef.current(s.value)
      }

      // Resting state = zero work. Do not re-arm the loop.
      if (settled) return
      rafId = requestAnimationFrame(frame)
    }

    const start = (): void => {
      if (rafId !== 0) return
      const s = stateRef.current
      // Already at rest on the target (mount, or a retarget to the same value):
      // paint the final value and never enter the loop at all.
      if (Math.abs(targetRef.current - s.value) < 0.02 && Math.abs(s.velocity) < 0.05) {
        s.value = targetRef.current
        s.velocity = 0
        if (s.value !== lastPaint) {
          lastPaint = s.value
          onUpdateRef.current(s.value)
        }
        return
      }
      // Fresh dt window — a settled loop may have been idle for minutes, and
      // the clamped max-dt would otherwise make the first frame lurch.
      last = performance.now()
      rafId = requestAnimationFrame(frame)
    }

    startRef.current = start
    start()
    return () => {
      stop()
      startRef.current = () => {}
    }
  }, [stiffness, damping, mass])
}
