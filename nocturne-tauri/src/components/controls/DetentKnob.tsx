import React, { useCallback, useEffect, useRef, useState } from 'react'
import { setVolume, toggleMute, usePlayerStore } from '../../stores/usePlayerStore'
import { useSpring } from '../../hooks/useSpring'
import { cn } from '../../lib/utils'

const DETENTS = 21
const ARC_DEG = 270
const DRAG_RANGE_PX = 150
const CENTER = 36
const TICK_R_IN = 30.5
const TICK_R_OUT = 34.5

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** Tick endpoint pair for detent i mapped over the 270° arc (-135° → +135°, 0° = top). */
function tickCoords(index: number): { x1: number; y1: number; x2: number; y2: number } {
  const deg = -ARC_DEG / 2 + (index * ARC_DEG) / (DETENTS - 1)
  const rad = (deg * Math.PI) / 180
  const sin = Math.sin(rad)
  const cos = Math.cos(rad)
  return {
    x1: CENTER + sin * TICK_R_IN,
    y1: CENTER - cos * TICK_R_IN,
    x2: CENTER + sin * TICK_R_OUT,
    y2: CENTER - cos * TICK_R_OUT
  }
}

const TICK_GEOM = Array.from({ length: DETENTS }, (_, i) => tickCoords(i))

/* ------------------------------------------------------------------ *
 * Micro-haptic audio tick — 2ms 2kHz sine at -30 dB (0.0316 linear),
 * native Web Audio only (zero npm deps), lazily unlocked on first use.
 * ------------------------------------------------------------------ */
let tickCtx: AudioContext | null = null

function playDetentTick(): void {
  try {
    if (!tickCtx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      tickCtx = new Ctor()
    }
    const ctx = tickCtx
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined)
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(2000, t)
    gain.gain.setValueAtTime(0.0316, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.002)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.004)
    osc.onended = () => {
      try {
        osc.disconnect()
        gain.disconnect()
      } catch {
        // ignore
      }
    }
  } catch {
    // Web Audio unavailable — decorative tick skipped silently.
  }
}

export interface DetentKnobProps {
  className?: string
}

/**
 * DetentKnob — 72px machined rotary volume dial with 21 magnetic detents.
 *
 * - 270° arc (-135° → +135°), amber conic fill + 21 perimeter SVG ticks.
 * - All continuous visuals (rotation, arc, tick illumination, bubble text)
 *   paint through CSS custom properties (`--k-rot`, `--k-arc`) driven by the
 *   useSpring primitive — no React re-render per frame.
 * - Inputs: vertical drag (150px = 0→100%, snapped to 5% detents), wheel
 *   (±5%, Shift ±1%), double-click mute toggle, arrows/Home/End keyboard.
 * - Crossing each 5% detent fires the Web Audio micro-tick.
 */
export function DetentKnob({ className }: DetentKnobProps): JSX.Element {
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)

  const rootRef = useRef<HTMLDivElement>(null)
  const bubbleTextRef = useRef<HTMLSpanElement>(null)
  const tickRefs = useRef<Array<SVGLineElement | null>>([])
  const detentRef = useRef(Math.floor((isMuted ? 0 : volume) / 5))
  const hideTimerRef = useRef<number | null>(null)
  const dragRef = useRef<{ pointerId: number; startY: number; startVol: number } | null>(null)

  const [bubbleVisible, setBubbleVisible] = useState(false)

  const effective = isMuted ? 0 : volume

  const showBubble = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
    setBubbleVisible(true)
  }, [])

  const settleBubble = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setBubbleVisible(false), 900)
  }, [])

  useEffect(
    () => () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    },
    []
  )

  /** Commit a volume change: quantize, fire detent tick on 5% crossings. */
  const commit = useCallback((next: number) => {
    const v = Math.round(clampPct(next))
    const detent = Math.floor(v / 5)
    if (detent !== detentRef.current) {
      detentRef.current = detent
      playDetentTick()
    }
    setVolume(v)
  }, [])

  /* Direct-DOM paint callback invoked by useSpring every frame. */
  const paint = useCallback((v: number) => {
    const clamped = clampPct(v)
    const root = rootRef.current
    if (root) {
      root.style.setProperty('--k-rot', `${-ARC_DEG / 2 + (clamped / 100) * ARC_DEG}deg`)
      root.style.setProperty('--k-arc', `${(clamped / 100) * ARC_DEG}deg`)
    }
    const lit = clamped / 5
    const ticks = tickRefs.current
    for (let i = 0; i < ticks.length; i++) {
      ticks[i]?.setAttribute('stroke', i <= lit ? '#f59e0b' : '#3a3f4b')
    }
    if (bubbleTextRef.current) {
      bubbleTextRef.current.textContent = `${Math.round(clamped)}%`
    }
  }, [])

  // Spring drives all continuous visuals (60fps, no re-render storms).
  useSpring(effective, paint, { stiffness: 340, damping: 30, mass: 1 })

  // Initial synchronous paint (before the first rAF frame lands).
  useEffect(() => {
    paint(effective)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ----------------------------- Gestures ----------------------------- */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      const st = usePlayerStore.getState()
      dragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startVol: st.isMuted ? 0 : st.volume
      }
      showBubble()
    },
    [showBubble]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const deltaPct = ((d.startY - e.clientY) / DRAG_RANGE_PX) * 100
      // Magnetic detents: snap to the nearest 5% stop on vertical travel.
      commit(Math.round((d.startVol + deltaPct) / 5) * 5)
    },
    [commit]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      settleBubble()
    },
    [settleBubble]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      showBubble()
      settleBubble()
      toggleMute()
    },
    [showBubble, settleBubble]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const st = usePlayerStore.getState()
      const base = st.isMuted ? 0 : st.volume
      const step = e.shiftKey ? 1 : 5
      let next: number | null = null
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = base + step
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = base - step
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = 100
      if (next === null) return
      e.preventDefault()
      // Owned by the knob while focused — keep global arrow hotkeys
      // (±5s seek) from double-firing on the same keypress.
      e.stopPropagation()
      showBubble()
      settleBubble()
      commit(next)
    },
    [commit, showBubble, settleBubble]
  )

  // Non-passive wheel: ±5% per notch, Shift ±1% fine precision.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      showBubble()
      settleBubble()
      const st = usePlayerStore.getState()
      const base = st.isMuted ? 0 : st.volume
      const step = e.shiftKey ? 1 : 5
      commit(base + (e.deltaY < 0 ? step : -step))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [commit, showBubble, settleBubble])

  /* ------------------------------- View ------------------------------- */

  return (
    <div
      ref={rootRef}
      dir="ltr"
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={effective}
      aria-valuetext={`${effective}%`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={showBubble}
      onMouseLeave={settleBubble}
      onFocus={showBubble}
      onBlur={settleBubble}
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={cn(
        'group relative h-[72px] w-[72px] shrink-0 rounded-full outline-none',
        'focus-visible:ring-1 focus-visible:ring-[#EAB308]/50',
        'cursor-ns-resize motion-reduce:cursor-default',
        isMuted && 'opacity-60',
        className
      )}
    >
      {/* Amber level arc (conic sweep from -135° = 225deg) */}
      <div
        aria-hidden="true"
        className="absolute inset-[6px] rounded-full"
        style={{
          background: 'conic-gradient(from 225deg, #f59e0b 0 var(--k-arc, 0deg), transparent 0)'
        }}
      />

      {/* 21 perimeter detent ticks (stroke mutated directly for 60fps) */}
      <svg viewBox="0 0 72 72" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {TICK_GEOM.map((g, i) => (
          <line
            key={i}
            ref={(el) => {
              tickRefs.current[i] = el
            }}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke="#3a3f4b"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* 72px machined-metal dial face (rotates via --k-rot) */}
      <div
        aria-hidden="true"
        className="absolute inset-[10px] rounded-full border border-white/10"
        style={{
          background: 'radial-gradient(circle at 32% 28%, #2a2e38 0%, #14161c 78%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 2px 6px rgba(0, 0, 0, 0.5)',
          transform: 'rotate(var(--k-rot, -135deg))',
          willChange: 'transform'
        }}
      >
        {/* Indicator pointer */}
        <span className="absolute left-1/2 top-[5px] h-[11px] w-[2px] -translate-x-1/2 rounded-full bg-[#f59e0b] shadow-[0_0_5px_rgba(245,158,11,0.85)]" />
        {/* Machined center hub */}
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
      </div>

      {/* Floating value bubble (.numeric Latin figures) */}
      <div
        aria-hidden="true"
        className={cn(
          'numeric pointer-events-none absolute left-1/2 top-[3px] z-10 -translate-x-1/2',
          'rounded-md border border-white/10 bg-[#0D0F15] px-1.5 py-0.5',
          'font-mono text-[10px] leading-none text-amber-400 shadow-xl',
          'transition-opacity duration-200',
          bubbleVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        <span ref={bubbleTextRef}>0%</span>
      </div>
    </div>
  )
}

export default DetentKnob
