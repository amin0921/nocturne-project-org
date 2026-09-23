import React, { useId, useRef, useState, useCallback, useEffect } from 'react'
import { formatTime } from '../types/player'
import { cn } from '../lib/utils'

const VIEW_W = 600
const VIEW_H = 44
const BAR_COUNT = 72

export interface WaveformSeekerProps {
  /** Normalized peaks, 0..1. If empty, renders an idle shimmer placeholder. */
  peaks?: number[]
  /** Playback progress 0..1 */
  progress: number
  currentTime: number // seconds
  duration: number // seconds
  isPlaying: boolean
  onSeek: (ratio: number) => void // 0..1
  className?: string
}

/**
 * WaveformSeeker Component
 * Replaces linear slider with dynamic SVG frequency bars and ember glow.
 * Supports pointer scrub seeking, hover timestamp tooltip, and idle shimmer placeholder.
 */
export function WaveformSeeker({
  peaks,
  progress,
  currentTime,
  duration,
  isPlaying: _isPlaying,
  onSeek,
  className
}: WaveformSeekerProps): JSX.Element {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const labelId = useId()

  // Live-value refs so the non-passive wheel listener binds once (zero
  // re-attachment churn per playback tick → no scrub hitching).
  const liveRef = useRef({ currentTime, duration, onSeek })
  useEffect(() => {
    liveRef.current = { currentTime, duration, onSeek }
  })

  const idle = !peaks || peaks.length === 0
  const bars = peaks && peaks.length > 0 ? peaks : Array.from({ length: BAR_COUNT }, () => 0.5)
  const slot = VIEW_W / bars.length
  const barW = Math.max(2, slot * 0.55)

  const ratioFromEvent = useCallback((clientX: number): number => {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const previewRatio = hoverRatio ?? (scrubbing ? progress : null)

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    setScrubbing(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    const r = ratioFromEvent(e.clientX)
    onSeek(r)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ratioFromEvent(e.clientX)
    setHoverRatio(r)
    if (scrubbing) {
      onSeek(r)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (scrubbing) {
      setScrubbing(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    if (scrubbing) {
      setScrubbing(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  // Tactile wheel scrubbing: ±2s per notch over the scrubber. Bound with
  // { passive: false } so preventDefault actually suppresses page scroll
  // (React's synthetic onWheel is passive in Chromium and cannot).
  useEffect(() => {
    const el = sliderRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const { currentTime: t, duration: d, onSeek: seek } = liveRef.current
      if (!d || d <= 0) return
      const delta = e.deltaY < 0 ? 2 : -2
      const target = Math.min(d, Math.max(0, t + delta))
      seek(target / d)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className={cn('group relative w-full select-none flex items-center', className)}>
      {/* hover / scrub timestamp bubble */}
      {previewRatio !== null && (
        <div
          className="numeric pointer-events-none absolute -top-8 z-20 -translate-x-1/2 rounded-md border border-white/10 bg-[#0D0F15] px-2 py-0.5 text-[11px] font-mono text-amber-400 shadow-xl"
          style={{ left: `${previewRatio * 100}%` }}
        >
          {formatTime(previewRatio * duration)}
        </div>
      )}

      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        aria-orientation="horizontal"
        onKeyDown={(e) => {
          // Owned by the slider while focused — stop bubbling so the global
          // studio hotkeys (window listener) never double-seek ±5s.
          if (e.key === 'ArrowRight') {
            e.stopPropagation()
            const step = duration > 0 ? 5 / duration : 0.05
            onSeek(Math.min(1, progress + step))
          } else if (e.key === 'ArrowLeft') {
            e.stopPropagation()
            const step = duration > 0 ? 5 / duration : 0.05
            onSeek(Math.max(0, progress - step))
          } else if (e.key === 'Home') {
            e.stopPropagation()
            onSeek(0)
          } else if (e.key === 'End') {
            e.stopPropagation()
            onSeek(1)
          }
        }}
        className="w-full cursor-pointer rounded-xl focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 py-1"
      >
        <span id={labelId} className="sr-only">
          Audio playback timeline
        </span>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block h-8 md:h-10 w-full overflow-visible"
          onMouseMove={(e) => setHoverRatio(ratioFromEvent(e.clientX))}
          onMouseLeave={() => setHoverRatio(null)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {bars.map((peak, i) => {
            const centerRatio = (i + 0.5) / bars.length
            const played = centerRatio <= progress
            const h = Math.max(4, peak * (VIEW_H - 10))
            const x = i * slot + (slot - barW) / 2
            const hovered = previewRatio !== null && centerRatio <= previewRatio
            return (
              <rect
                key={i}
                x={x}
                y={(VIEW_H - h) / 2}
                width={barW}
                height={h}
                rx={barW / 2}
                className={cn(idle && 'waveform-idle-bar')}
                style={idle ? { animationDelay: `${(i % 12) * 0.09}s` } : undefined}
                fill={played ? '#EAB308' : hovered ? 'rgba(234,179,8,0.55)' : 'rgba(148,163,184,0.3)'}
                opacity={played ? 1 : 0.85}
              />
            )
          })}
          {/* playhead */}
          <line
            x1={Math.max(0, Math.min(VIEW_W, progress * VIEW_W))}
            x2={Math.max(0, Math.min(VIEW_W, progress * VIEW_W))}
            y1={2}
            y2={VIEW_H - 2}
            stroke="#F2F3F5"
            strokeWidth={1.75}
            strokeLinecap="round"
            opacity={0.95}
          />
        </svg>
      </div>

      {/* played bars glow */}
      <style>{`
        [role="slider"] rect[fill="#EAB308"] {
          filter: drop-shadow(0 0 4px rgba(234,179,8,0.6));
        }
      `}</style>
    </div>
  )
}

export default WaveformSeeker
