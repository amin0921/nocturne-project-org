import React, { useState, useEffect, useRef } from 'react'
import { MicVocal, X } from 'lucide-react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { LyricsPane } from './LyricsPane'
import { cn } from '../lib/utils'

export interface DynamicIslandLyricsProps {
  isExpanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  className?: string
}

/** Per-track fine-tune offsets live in localStorage, keyed by track id/path. */
const OFFSET_STORAGE_PREFIX = 'nocturne:lyrics-offset:'
const OFFSET_CLAMP_SEC = 10

function loadStoredOffset(trackKey: string | null): number {
  if (!trackKey) return 0
  try {
    const raw = window.localStorage.getItem(OFFSET_STORAGE_PREFIX + trackKey)
    if (raw === null) return 0
    const value = Number.parseFloat(raw)
    return Number.isFinite(value)
      ? Math.max(-OFFSET_CLAMP_SEC, Math.min(OFFSET_CLAMP_SEC, value))
      : 0
  } catch {
    return 0
  }
}

function saveStoredOffset(trackKey: string | null, value: number): void {
  if (!trackKey) return
  try {
    const key = OFFSET_STORAGE_PREFIX + trackKey
    if (value === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, String(value))
  } catch {
    // Storage unavailable (private mode) — calibration simply won't persist.
  }
}

/**
 * DynamicIslandLyrics Component
 * Apple-style morphing Dynamic Island for synchronized lyrics — Split-Stage Morph.
 * - Collapsed: compact 136x36px pill anchored top-center of the Stage
 *   (visually `left-1/2 -translate-x-1/2`; expressed right-anchored as
 *   `right: calc(50% - 68px)` so the same pixels interpolate smoothly).
 * - Expanded: wide right-stage canvas — top-4 right-4 sm:right-6,
 *   47% (max 480px) x 410px — while the artwork shifts 135/155/175px
 *   left, tightening the Step-72 gap by ~1/3 while keeping a guaranteed
 *   ~95px no-overlap zone in standard window dimensions.
 * - GPU layer isolation: transform-gpu (translate3d z=0) + will-change
 *   transform + backface-visibility hidden on the artwork container;
 *   identical layer promotion on the island itself.
 * - Pure CSS morph: exact per-property list, all on the unified
 *   380ms cubic-bezier(0.16, 1, 0.3, 1) deceleration curve (no `all`,
 *   so no extra properties snap at frame 100%).
 * - Content fade sync: inner canvas layer uses a smooth continuous
 *   opacity curve (duration-300 delay-150) so typography never shocks
 *   the compositor mid-morph (no end-of-transition micro-jerk).
 * - Explicit pixel radii (20px <-> 28px) prevent border-radius interpolation snags.
 * - Zero layout shift constraint: contain: layout style; isolation: isolate (never paint).
 * - Closes on Escape or outside click (player bar / seek / volume clicks are guarded).
 * - On expand, re-centers the active lyric line only after transition end
 *   (~420ms — all 380ms geometry fully settled), gated with pointer-events.
 * - Header calibration strip: ±0.5s pills + non-zero offset badge, per-track
 *   offsets persisted in localStorage for instant real-time re-alignment.
 */
export function DynamicIslandLyrics({
  isExpanded: controlledExpanded,
  onExpandChange,
  className
}: DynamicIslandLyricsProps): JSX.Element {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

  const setExpanded = (next: boolean) => {
    if (controlledExpanded === undefined) {
      setInternalExpanded(next)
    }
    onExpandChange?.(next)
  }

  const containerRef = useRef<HTMLDivElement | null>(null)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const trackKey = currentTrack ? String(currentTrack.id ?? currentTrack.path ?? '') : null

  // Fine-tune calibration: per-track manual offset (seconds) applied on top of
  // LRC timestamps. Restored on track change, persisted on every nudge.
  const [manualOffset, setManualOffset] = useState(0)

  useEffect(() => {
    setManualOffset(loadStoredOffset(trackKey))
  }, [trackKey])

  const nudgeOffset = (delta: number) => {
    setManualOffset((prev) => {
      // Round to 0.1s to keep the badge crisp and avoid float drift.
      const next = Math.max(
        -OFFSET_CLAMP_SEC,
        Math.min(OFFSET_CLAMP_SEC, Math.round((prev + delta) * 10) / 10)
      )
      saveStoredOffset(trackKey, next)
      return next
    })
  }

  // Handle Escape key and outside clicks when expanded
  useEffect(() => {
    if (!isExpanded) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
      }
    }

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element | null
      // Guard: never dismiss when interacting with the player bar, seek slider,
      // or volume controls (bottom floating capsule).
      if (
        target &&
        typeof (target as Element).closest === 'function' &&
        ((target as Element).closest('[data-player-bar]') ||
          (target as Element).closest('footer') ||
          (target as Element).closest('#floating-controls'))
      ) {
        return
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isExpanded])

  return (
    <div
      ref={containerRef}
      className={cn(
        'transform-gpu absolute z-30 bg-[#0D0F15] overflow-hidden pointer-events-auto select-none',
        isExpanded
          ? 'top-4 right-4 sm:right-6 w-[47%] max-w-[480px] h-[410px] rounded-[28px] border border-white/10 border-t-white/20 shadow-[0_24px_64px_rgba(0,0,0,0.85)]'
          : 'top-3 right-[calc(50%_-_68px)] w-[136px] h-9 rounded-[20px] border border-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.6)] cursor-pointer hover:scale-[1.03] hover:border-white/20 active:scale-[0.98]',
        isPlaying && !isExpanded && 'island-capsule-pulse',
        className
      )}
      style={{
        isolation: 'isolate',
        contain: 'layout style',
        transition:
          'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), width 380ms cubic-bezier(0.16, 1, 0.3, 1), height 380ms cubic-bezier(0.16, 1, 0.3, 1), right 380ms cubic-bezier(0.16, 1, 0.3, 1), top 380ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 380ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 380ms cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform'
      }}
    >
        {/* Layer 1: Collapsed Pill View (fades out in 80ms) */}
        <div
          onClick={() => {
            if (!isExpanded) setExpanded(true)
          }}
          className={cn(
            'absolute inset-0 flex items-center justify-center gap-2 px-3 transition-all duration-150',
            isExpanded
              ? 'opacity-0 pointer-events-none scale-90 blur-[2px]'
              : 'opacity-100 pointer-events-auto scale-100 blur-0'
          )}
          role="button"
          tabIndex={isExpanded ? -1 : 0}
          aria-expanded={isExpanded}
          aria-label="Open synchronized lyrics"
          onKeyDown={(e) => {
            if (!isExpanded && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              setExpanded(true)
            }
          }}
        >
          <MicVocal size={13} className="text-[#EAB308] shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase shrink-0">
            LYRICS
          </span>
          {/* Zero-CPU 3-bar micro equalizer: pure CSS scaleY keyframes while
              playing; rests at scaleY(0.25) when paused; fades out on expand. */}
          <span
            aria-hidden="true"
            className={cn(
              'flex h-[10px] shrink-0 items-end gap-[2px] transition-opacity duration-200',
              isExpanded ? 'opacity-0' : 'opacity-100'
            )}
          >
            {[1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={cn(
                  'island-eq-bar w-[2px] h-[10px] rounded-full bg-amber-400/90',
                  isPlaying && `island-eq-bar-${bar}`
                )}
              />
            ))}
          </span>
        </div>

        {/* Layer 2: Expanded Canvas View (fades in with blur reveal).
            Smooth continuous opacity curve: duration-300 delay-150 — no
            abrupt compositor shock; the text settles in gently while/after
            the 380ms morph docks. transition stays scoped to opacity/filter
            so this layer never independently interpolates layout props
            (inset follows parent only; blur still animates on collapse). */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col min-h-0 min-w-0 overflow-hidden transition-[opacity,filter] duration-300',
            isExpanded
              ? 'opacity-100 pointer-events-auto filter-none delay-150'
              : 'opacity-0 pointer-events-none filter blur-[4px]'
          )}
          aria-hidden={!isExpanded}
        >
          {/* Header Bar with Track Title, Offset Calibration Strip & Close Button */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-5 bg-white/[0.02]">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <MicVocal size={13} className="text-[#EAB308] shrink-0" aria-hidden="true" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase shrink-0">
                LYRICS
              </span>
              {currentTrack?.title && (
                <span className="text-[11px] text-slate-500 font-mono tracking-tight truncate">
                  / {currentTrack.title}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Fine-tune calibration strip: ±0.5s instant timestamp shift */}
              <div
                role="group"
                aria-label="Lyrics timing calibration"
                className="flex items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() => nudgeOffset(-0.5)}
                  className="flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-mono font-semibold text-slate-400 outline-none transition-colors hover:border-white/20 hover:bg-white/15 hover:text-white focus-visible:ring-1 focus-visible:ring-[#EAB308]"
                  aria-label="Shift lyrics 0.5 seconds earlier"
                  tabIndex={isExpanded ? 0 : -1}
                >
                  −0.5s
                </button>

                {manualOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => nudgeOffset(-manualOffset)}
                    title="Reset lyrics offset"
                    className="flex h-6 items-center rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-2 text-[10px] font-mono font-bold text-[#EAB308] outline-none transition-colors hover:bg-[#EAB308]/20 focus-visible:ring-1 focus-visible:ring-[#EAB308]"
                    aria-label={`Lyrics offset ${manualOffset > 0 ? 'plus' : 'minus'} ${Math.abs(manualOffset).toFixed(1)} seconds. Activate to reset.`}
                    tabIndex={isExpanded ? 0 : -1}
                  >
                    {manualOffset > 0 ? '+' : ''}
                    {manualOffset.toFixed(1)}s
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => nudgeOffset(0.5)}
                  className="flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-mono font-semibold text-slate-400 outline-none transition-colors hover:border-white/20 hover:bg-white/15 hover:text-white focus-visible:ring-1 focus-visible:ring-[#EAB308]"
                  aria-label="Shift lyrics 0.5 seconds later"
                  tabIndex={isExpanded ? 0 : -1}
                >
                  +0.5s
                </button>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[14px] bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]"
                aria-label="Close lyrics"
                tabIndex={isExpanded ? 0 : -1}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Body: High-End Spotify-Style Lyrics Engine */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative">
            <LyricsPane active={isExpanded} manualOffset={manualOffset} />
          </div>
        </div>
    </div>
  )
}

export default DynamicIslandLyrics
