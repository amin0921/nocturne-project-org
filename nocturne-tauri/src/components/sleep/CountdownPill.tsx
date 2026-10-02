import React, { useEffect, useRef, useState } from 'react'
import { MoonStar } from 'lucide-react'
import { useSleepTimer } from '../../stores/useSleepTimer'
import { cn } from '../../lib/utils'

function formatRemaining(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export interface CountdownPillProps {
  onClick?: () => void
  className?: string
}

/**
 * CountdownPill — the ONLY component that ticks. A local 1 Hz interval drives
 * local state, so the countdown never re-renders the PlayerBar or any parent.
 *
 * The breathing amber ring is a pair of absolutely-positioned spans (see
 * index.css `sleep-breathe`): scale 1 -> 1.06, 2.4s ease-in-out, composite-only
 * (transform/opacity, zero box-shadow).
 *
 * GPU-offload step (2026-10-02): the breathe is FINITE — 4 iterations, then
 * the ring rests at the resting keyframe instead of looping forever. It is
 * re-triggered by re-mounting the spans via React `key` (no timers, no rAF)
 * on: pill mount, displayed-minute change, and window refocus while armed.
 *
 * Idle-audit fix (2026-10-02): while the window is hidden or unfocused the
 * breathe is frozen via `animation-play-state: paused` — the same P0 gating
 * pattern as the waveform shimmer.
 */
export function CountdownPill({ onClick, className }: CountdownPillProps): JSX.Element | null {
  const mode = useSleepTimer((s) => s.mode)
  const endAt = useSleepTimer((s) => s.endAt)

  const [remaining, setRemaining] = useState(() =>
    endAt !== null ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : 0
  )
  const [suspended, setSuspended] = useState(false)
  // Bumped to remount the breathe spans and replay the 4-breath cycle.
  const [breathEpoch, setBreathEpoch] = useState(0)
  const shownMinuteRef = useRef<number | null>(null)

  useEffect(() => {
    const sync = (): void => {
      setSuspended(document.visibilityState === 'hidden' || !document.hasFocus())
    }
    // Refocus re-triggers the breaths (the component only exists while the
    // timer is armed, so being mounted is the "still armed" condition) and
    // clears the suspension in the same handler.
    const onFocus = (): void => {
      sync()
      setBreathEpoch((e) => e + 1)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Re-trigger the breaths whenever the DISPLAYED minute changes (the pill
  // re-renders every second; the minute value only moves once per minute).
  useEffect(() => {
    if (mode !== 'timed') {
      shownMinuteRef.current = null
      return
    }
    const minute = Math.floor(remaining / 60)
    if (shownMinuteRef.current !== null && minute !== shownMinuteRef.current) {
      setBreathEpoch((e) => e + 1)
    }
    shownMinuteRef.current = minute
  }, [mode, remaining])

  useEffect(() => {
    if (mode !== 'timed' || endAt === null) return
    const tick = (): void => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [mode, endAt])

  if (mode === 'inactive') return null

  const label =
    mode === 'timed'
      ? formatRemaining(remaining)
      : mode === 'end-of-track'
        ? 'End of track'
        : 'End of queue'

  return (
    <button
      type="button"
      onClick={onClick}
      title="Sleep timer active — click for options"
      aria-label={`Sleep timer active: ${mode === 'timed' ? `${label} remaining` : label}`}
      className={cn(
        'sleep-pill sleep-badge-pop numeric flex h-7 shrink-0 items-center gap-1.5 rounded-full',
        suspended && 'sleep-pill-suspended',
        'border border-[#EAB308]/40 bg-[#EAB308]/10 px-2.5',
        'font-mono text-[11px] font-medium tabular-nums text-ember',
        'transition-colors duration-150 hover:bg-[#EAB308]/20',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/50',
        className
      )}
    >
      {/* Breathe layers — remounted via key to replay the finite 4-breath
          cycle on mount / minute change / refocus (see index.css). */}
      <span aria-hidden key={`halo-${breathEpoch}`} className="sleep-pill-halo" />
      <span aria-hidden key={`ring-${breathEpoch}`} className="sleep-pill-ring" />
      <MoonStar size={12} aria-hidden />
      <span dir="ltr">{label}</span>
    </button>
  )
}

export default CountdownPill
