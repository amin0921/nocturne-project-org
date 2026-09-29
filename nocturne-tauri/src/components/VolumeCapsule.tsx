import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Volume1, Volume2, VolumeX } from 'lucide-react'
import { setVolume, toggleMute, usePlayerStore } from '../stores/usePlayerStore'
import { cn } from '../lib/utils'
import { normalizeWheelStep } from '../lib/wheel'

/** Wheel step per notch. Unchanged for Windows; macOS scales this by magnitude. */
const VOLUME_WHEEL_STEP = 5

export interface VolumeCapsuleProps {
  className?: string
}

/**
 * VolumeCapsule Component
 * Category 4: Expandable Morphing Floating Volume Capsule with Scroll Wheel Modulation.
 * - Compact state: Speaker icon + numeric percentage (.numeric LTR digits).
 * - Expanded state on hover / interaction: Smooth width morphing revealing sleek amber track.
 * - Scroll wheel support: Modulates volume in ±5% increments, stops event propagation.
 * - Speaker toggle: Mutes / restores previous volume level.
 * - Pure React + Tailwind CSS with GPU transitions (zero external motion libraries).
 */
export function VolumeCapsule({ className }: VolumeCapsuleProps): JSX.Element {
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)

  const [isHovered, setIsHovered] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const capsuleRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevVolumeRef = useRef<number>(volume > 0 ? volume : 80)

  const isExpanded = isHovered || isInteracting || isFocused
  const effectiveVolume = isMuted ? 0 : volume

  // Track the last non-zero volume so unmute restores it cleanly
  useEffect(() => {
    if (volume > 0) {
      prevVolumeRef.current = volume
    }
  }, [volume])

  // Cleanup wheel timer on unmount
  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    }
  }, [])

  // Non-passive wheel listener guarantees preventDefault and prevents window/queue scrolling
  useEffect(() => {
    const el = capsuleRef.current
    if (!el) return

    let lastWheelAt = 0
    const onWheel = (e: WheelEvent) => {
      // macOS reports a trackpad pinch-zoom as ctrl+wheel. Never swallow it —
      // pinch-zoom must still zoom, exactly as anywhere else in the app.
      if (e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()

      setIsInteracting(true)
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(() => setIsInteracting(false), 900)

      // normalizeWheelStep returns the original flat ±5 per event for every
      // Windows wheel event, so Windows volume feel is unchanged. macOS scales
      // by the trackpad's reported magnitude and damps the momentum tail.
      const { step } = normalizeWheelStep(e, VOLUME_WHEEL_STEP, lastWheelAt)
      lastWheelAt = performance.now()

      const storeState = usePlayerStore.getState()
      const current = storeState.isMuted ? 0 : storeState.volume
      const nextVol = Math.min(100, Math.max(0, current + step))
      setVolume(nextVol)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (isMuted || volume === 0) {
        if (isMuted) {
          toggleMute()
        } else {
          setVolume(prevVolumeRef.current || 80)
        }
      } else {
        prevVolumeRef.current = volume
        toggleMute()
      }
    },
    [isMuted, volume]
  )

  const updateVolumeFromPointer = useCallback((clientX: number) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setVolume(Math.round(ratio * 100))
  }, [])

  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      setIsInteracting(true)
      updateVolumeFromPointer(e.clientX)

      const handlePointerMove = (ev: PointerEvent) => {
        updateVolumeFromPointer(ev.clientX)
      }
      const handlePointerUp = () => {
        setIsInteracting(false)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [updateVolumeFromPointer]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setVolume(Math.min(100, effectiveVolume + 5))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setVolume(Math.max(0, effectiveVolume - 5))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setVolume(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setVolume(100)
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        if (isMuted || volume === 0) {
          if (isMuted) toggleMute()
          else setVolume(prevVolumeRef.current || 80)
        } else {
          prevVolumeRef.current = volume
          toggleMute()
        }
      }
    },
    [effectiveVolume, isMuted, volume]
  )

  const muteLabel = isMuted || effectiveVolume === 0 ? 'Unmute' : 'Mute'

  return (
    <div
      ref={capsuleRef}
      dir="ltr"
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuenow={effectiveVolume}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${effectiveVolume}%`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex h-9 items-center justify-between overflow-hidden select-none',
        'rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20',
        'px-2 text-[#94A3B8] hover:text-[#F2F3F5] backdrop-blur-md',
        'transition-[width,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
        isExpanded ? 'w-[172px]' : 'w-[74px]',
        className
      )}
    >
      {/* Speaker Icon / Mute Button */}
      <button
        type="button"
        onClick={handleToggleMute}
        aria-label={muteLabel}
        title={muteLabel}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
      >
        {isMuted || effectiveVolume === 0 ? (
          <VolumeX size={15} aria-hidden />
        ) : effectiveVolume <= 50 ? (
          <Volume1 size={15} aria-hidden />
        ) : (
          <Volume2 size={15} aria-hidden />
        )}
      </button>

      {/* Morphing Interactive Volume Track (revealed on expansion) */}
      <div
        className={cn(
          'flex items-center overflow-hidden transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          isExpanded ? 'max-w-[88px] flex-1 px-1.5 opacity-100' : 'max-w-0 px-0 opacity-0 pointer-events-none'
        )}
      >
        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          className="group/track relative flex h-5 w-full cursor-pointer items-center"
        >
          {/* Track background */}
          <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            {/* Active Amber Fill */}
            <div
              className="h-full rounded-full bg-ember shadow-[0_0_8px_rgba(234,179,8,0.5)] transition-all duration-75"
              style={{ width: `${effectiveVolume}%` }}
            />
          </div>

          {/* Draggable Knob */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-ink border border-ember shadow-sm pointer-events-none transition-transform group-hover/track:scale-125"
            style={{ left: `${effectiveVolume}%` }}
          />
        </div>
      </div>

      {/* Numeric Percentage Badge (.numeric LTR tabular digits) */}
      <span className="numeric shrink-0 min-w-[28px] text-right text-[11px] font-semibold tabular-nums text-faint group-hover:text-ink transition-colors">
        {effectiveVolume}%
      </span>
    </div>
  )
}

export default VolumeCapsule
