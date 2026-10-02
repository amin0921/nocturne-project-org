import React, { useEffect, useState } from 'react'
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
 * The breathing amber ring is a CSS ::after ring + ::before halo animation
 * (see index.css `sleep-breathe`): scale 1 -> 1.06, 2.4s ease-in-out,
 * composite-only (transform/opacity, zero box-shadow).
 *
 * Idle-audit fix (2026-10-02): even composite-only, a 2.4s infinite loop keeps
 * the transparent window's compositor awake (measured ~5.7% GPU median while
 * the window is focused+visible). When the window is hidden or unfocused the
 * loop is frozen via `animation-play-state: paused` — the same P0 gating
 * pattern as the waveform shimmer — so an armed timer with the window in the
 * background costs ~0% (measured 0.59% GPU). Resuming is pixel-identical:
 * the timeline pauses, it does not restart.
 */
export function CountdownPill({ onClick, className }: CountdownPillProps): JSX.Element | null {
  const mode = useSleepTimer((s) => s.mode)
  const endAt = useSleepTimer((s) => s.endAt)

  const [remaining, setRemaining] = useState(() =>
    endAt !== null ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : 0
  )
  const [suspended, setSuspended] = useState(false)

  useEffect(() => {
    const sync = (): void => {
      setSuspended(document.visibilityState === 'hidden' || !document.hasFocus())
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

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
      <MoonStar size={12} aria-hidden />
      <span dir="ltr">{label}</span>
    </button>
  )
}

export default CountdownPill
