import React, { useId, useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { formatTime, type LyricLine } from '../types/player'
import { cn } from '../lib/utils'
import { usePlayerStore } from '../stores/usePlayerStore'

const VIEW_W = 600
const VIEW_H = 44
const BAR_COUNT = 72

/**
 * Binary search for the matching active lyric line.
 * O(log N) lookup ensures silky 60fps/144fps tracking during pointer hover without layout jitter.
 */
function findActivePreviewLine<T extends { time: number }>(lines: T[], previewTime: number): T | undefined {
  if (!lines || lines.length === 0) return undefined
  let low = 0
  let high = lines.length - 1
  let result: T | undefined = undefined

  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= previewTime) {
      result = lines[mid]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

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
  lyrics?: LyricLine[] | { time: number; text: string }[]
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
  className,
  lyrics: propsLyrics
}: WaveformSeekerProps): JSX.Element {
  const storeLyrics = usePlayerStore((s) => s.currentLyrics)
  const activeLyrics = propsLyrics ?? storeLyrics ?? []

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
  const previewTime = previewRatio !== null ? previewRatio * duration : 0

  const activePreviewLine = useMemo(() => {
    if (previewRatio === null || activeLyrics.length === 0) return undefined
    return findActivePreviewLine(activeLyrics, previewTime)
  }, [activeLyrics, previewRatio, previewTime])

  const lyricSnippet = useMemo(() => {
    if (previewRatio === null) return null
    if (activePreviewLine && activePreviewLine.text && activePreviewLine.text.trim().length > 0) {
      if (previewTime - activePreviewLine.time < 12) {
        return activePreviewLine.text.trim()
      }
      return '♪'
    }
    if (activeLyrics.length > 0) {
      return '♪'
    }
    return null
  }, [previewRatio, activePreviewLine, previewTime, activeLyrics.length])

  // Boundary Clamping: clamp horizontal left percentage so the floating capsule
  // stays comfortably within screen boundaries without clipping at track start or end.
  const clampedPercent = previewRatio !== null ? Math.max(8, Math.min(92, previewRatio * 100)) : 50

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
      {/* hover / scrub lyric-aware floating preview capsule */}
      {previewRatio !== null && (
        <div
          className="pointer-events-none absolute bottom-[calc(100%+14px)] z-50 -translate-x-1/2 flex flex-col items-center gap-0.5 rounded-xl border border-white/10 bg-[#121419]/95 px-3 py-1.5 backdrop-blur-xl transition-opacity duration-150 ease-out select-none max-w-[280px]"
          style={{
            left: `${clampedPercent}%`,
            boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.12)'
          }}
        >
          <span className="numeric text-[11px] font-semibold text-[#f59e0b]">
            {formatTime(previewRatio * duration)}
          </span>
          {lyricSnippet && (
            <span
              dir="auto"
              className="truncate text-[11px] font-medium text-white/85 max-w-[240px] text-center"
            >
              {lyricSnippet}
            </span>
          )}
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
