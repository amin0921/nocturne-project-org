import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MicVocal, X } from 'lucide-react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useLyricOffset } from '../stores/useLyricOffset'
import { useTrackSwapFade } from '../hooks/useTrackSwapFade'
import { LyricsPane } from './LyricsPane'
import { cn } from '../lib/utils'

export interface DynamicIslandLyricsProps {
  isExpanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  className?: string
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
 * - Footer calibration capsule: minimalist ±0.5s nudge strip with per-track
 *   offsets persisted in SQLite (`lyric_offsets`) — shared with the Cinema
 *   Stage through one store, so a nudge or ↺ reset applies everywhere at once.
 * - Split-stage track skips: the island container is NEVER torn down or
 *   collapsed on track change — `trackKey` drives a pre-paint opacity dip and
 *   a smooth reveal (useTrackSwapFade) so the new title/lyrics cross-fade into
 *   the already-open island. The scroll reset + line-0 re-center for the new
 *   track live in LyricsPane's own track-change effects (same container, no
 *   remount).
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

  // Fine-tune calibration: per-track manual offset (ms) applied on top of LRC
  // timestamps. The value lives in one shared SQLite-backed store used by both
  // this island and the Cinema Stage, so a nudge or ↺ reset is live everywhere.
  const { offsetMs, nudge, setOffsetMs } = useLyricOffset(trackKey)
  const handleNudge = useCallback((deltaMs: number) => nudge(deltaMs), [nudge])
  const handleReset = useCallback(() => setOffsetMs(0), [setOffsetMs])

  // Track-swap cross-fade: flips to 0 BEFORE the new track paints (so the
  // title/lyrics payload swap is never seen mid-flight) and eases back to 1 —
  // all without collapsing, remounting or re-morphing the island container.
  const swapFade = useTrackSwapFade(trackKey)
  const swapStyle: React.CSSProperties = {
    opacity: swapFade,
    pointerEvents: swapFade === 1 ? undefined : 'none',
    transition: swapFade === 1 ? 'opacity 240ms ease' : 'none'
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
              ? 'opacity-0 pointer-events-none scale-90'
              : 'opacity-100 pointer-events-auto scale-100'
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

        {/* Layer 2: Expanded Canvas View (fades in with opacity only — zero
            blur/filter anywhere on the lyric canvas so WebView2 keeps native
            subpixel glyph rasterization). Smooth continuous opacity curve:
            duration-300 delay-150 — no abrupt compositor shock; the text
            settles in gently while/after the 380ms morph docks. transition is
            scoped to opacity so this layer never independently interpolates
            layout props (inset follows parent only). */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col min-h-0 min-w-0 overflow-hidden transition-opacity duration-300',
            isExpanded
              ? 'opacity-100 pointer-events-auto delay-150'
              : 'opacity-0 pointer-events-none'
          )}
          aria-hidden={!isExpanded}
        >
          {/* Header Bar with Track Title, Offset Calibration Strip & Close Button */}
          <div style={swapStyle} className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-5 bg-white/[0.02]">
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
          <div style={swapStyle} className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative">
            <LyricsPane active={isExpanded} manualOffset={offsetMs / 1000} />
          </div>

          {/* Studio calibration footer: per-track SQLite timing nudge capsule.
              Shared with Cinema Stage — same rows, same semantics. */}
          {trackKey && (
            <div style={swapStyle} className="shrink-0 px-3 pb-3 pt-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono select-none">
                <button
                  onClick={() => handleNudge(-500)}
                  className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Lyrics earlier (-0.5s)"
                >
                  -0.5s
                </button>
                <span className={offsetMs !== 0 ? "text-amber-400 font-bold min-w-[42px] text-center" : "text-white/40 min-w-[42px] text-center"}>
                  {offsetMs === 0 ? "0.0s" : `${offsetMs > 0 ? "+" : ""}${(offsetMs / 1000).toFixed(1)}s`}
                </span>
                <button
                  onClick={() => handleNudge(500)}
                  className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Lyrics later (+0.5s)"
                >
                  +0.5s
                </button>
                {offsetMs !== 0 && (
                  <button
                    onClick={handleReset}
                    className="text-[11px] text-white/40 hover:text-white ml-0.5 px-1 py-0.5 rounded hover:bg-white/10 transition-colors"
                    title="Reset offset (0.0s)"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

export default DynamicIslandLyrics
