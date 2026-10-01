import React, { useLayoutEffect, useRef, useState } from 'react'
import { Disc3, Maximize2, MicVocal, Music } from 'lucide-react'
import { useUIStore } from '../stores/useUIStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { AmbientGlow } from './AmbientGlow'
import { ViewToggle } from './ViewToggle'
import { TiltCard } from './TiltCard'
import { Marquee } from './Marquee'
import { WindowGripPill } from './WindowGripPill'
import { DynamicIslandLyrics } from './DynamicIslandLyrics'
import { StatsDashboard } from './stats/StatsDashboard'
import { useAmbientPalette } from '../stores/useAmbientPalette'
import { useTrackSwapFade } from '../hooks/useTrackSwapFade'
import { armMotionLayer, decodeThenSwap } from '../utils/artwork'
import { resolveCoverUrl } from '../utils/cover-url'
import { cn } from '../lib/utils'

export interface CenterIslandProps {
  libraryContent: React.ReactNode
  onAddFolder?: () => void
  scanning?: boolean
  className?: string
}

/**
 * CenterIsland Component
 * Dynamic center island shell that renders the cinematic artwork stage or the full library table.
 * Swaps view with zero layout jitter; stage enter uses GPU-only transform+opacity crossfade.
 */
export function CenterIsland({
  libraryContent,
  onAddFolder,
  scanning,
  className
}: CenterIslandProps): JSX.Element {
  const view = useUIStore((s) => s.view)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLyricsExpanded = useUIStore((s) => s.lyricsOpen)
  const setLyricsOpen = useUIStore((s) => s.setLyricsOpen)
  const ambientPalette = useAmbientPalette()

  // Split-stage stability across track skips:
  // - `isLyricsExpanded` is NEVER reset because the track changed — if the
  //   user opened lyrics, the split-stage stays open and the new cover/lyrics
  //   cross-fade into place (no collapse/re-expand morph in the swap frame).
  // - Artwork cover errors are tracked per-src (not a boolean), so a fresh
  //   track's cover is never judged by the previous track's failure state.
  // - `swapFade` hides the artwork/metadata swap pre-paint and reveals it with
  //   a smooth opacity fade — zero remount, zero layout thrash.
  const [failedCoverSrc, setFailedCoverSrc] = useState<string | null>(null)
  const rawCoverSrc = resolveCoverUrl(currentTrack?.coverUrl)
  const coverSrc = rawCoverSrc && failedCoverSrc !== rawCoverSrc ? rawCoverSrc : undefined
  const swapFade = useTrackSwapFade(currentTrack?.id ?? null)

  // Pre-decoded artwork double-buffer (Patch 137): the <img> keeps showing the
  // PREVIOUS cover until the new hi-res bytes finish decoding OFF the pipeline
  // (decodeThenSwap + monotonic race token). Assigning a fresh src therefore
  // never lands a synchronous decode inside the 300ms swap frame — Chromium
  // holds back active CSS transforms while decoding (bug 1455946), which was
  // the documented 1-2 frame drop on track swap.
  const coverImgRef = useRef<HTMLImageElement | null>(null)
  const [decodedCover, setDecodedCover] = useState<string | undefined>(() => coverSrc)

  useLayoutEffect(() => {
    if (!coverSrc) {
      if (decodedCover !== undefined) setDecodedCover(undefined)
      return
    }
    if (coverSrc === decodedCover) return
    const img = coverImgRef.current
    if (!img) {
      // No <img> mounted yet (first paint after an absent/failed cover): there
      // is no swap frame to protect — let the browser decode it directly.
      setDecodedCover(coverSrc)
      return
    }
    let alive = true
    void decodeThenSwap(img, coverSrc).then((ok) => {
      if (alive && ok) setDecodedCover(coverSrc)
    })
    return () => {
      alive = false
    }
  }, [coverSrc, decodedCover])

  // GPU layer lifecycle around track swaps / island morphs: `will-change:
  // transform, opacity` is armed before each 300ms swap transition starts and
  // released the moment its transitionend fires — compositing is held ONLY
  // while the swap animates, then the full-size layer is handed back.
  const motionWrapperRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => armMotionLayer(motionWrapperRef.current), [swapFade, isLyricsExpanded])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col select-none relative overflow-hidden', className)}>
      {/* Island Top Bar with Title, Drag Handle Pill, and View Toggle */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5 relative z-20">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[11px] font-medium tracking-[0.2em] text-slate-400/70 uppercase select-none shrink-0">
            {view === 'stage' ? 'Now Playing' : view === 'stats' ? 'Listening Stats' : 'Library'}
          </h2>
          {view === 'stage' && currentTrack?.album && currentTrack.album !== 'Unknown Album' && (
            <span className="hidden sm:inline-block text-[11px] text-slate-500/80 font-mono tracking-tight truncate max-w-xs">
              / {currentTrack.album}
            </span>
          )}
        </div>

        <WindowGripPill label="Nocturne" className="hidden sm:flex" />

        <div className="pointer-events-auto shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => useUIStore.getState().setCinemaOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#121419]/80 text-muted hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400 transition-all duration-200 active:scale-95"
            title="Cinema Stage / استیج سینمایی (Shift+F)"
            aria-label="Open Cinema Stage"
          >
            <Maximize2 size={14} />
          </button>
          <ViewToggle />
        </div>
      </div>

      {/*
        Main Content Area — PERSISTENT PANES.

        All three views stay mounted and are toggled with `display: none` only.
        The previous conditional ternary destroyed the inactive subtree, so
        switching INTO library synchronously remounted the whole 127-row table
        (with its cover <img> nodes) in one frame and hung for ~150ms, while
        switching back to stage felt instant only because the stage subtree
        happened to be small. A CSS repaint is now the entire cost, and the
        library table keeps its own scrollTop across switches.
      */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          view === 'stage' ? 'flex' : 'hidden'
        )}
        aria-hidden={view !== 'stage'}
      >
        {currentTrack ? (
          <div
            /* NOTE: deliberately NOT keyed by track id — remounting this subtree
               in the same paint frame as a track skip tears down the lyrics
               island, restarts the artwork FLIP and re-parses lyrics all at
               once (the documented split-stage hitch). Track swaps are handled
               by GPU opacity cross-fades instead (useTrackSwapFade). */
            /* Cinematic stage is a permanent zero-scroll canvas: overflow-hidden
               on BOTH axes so a transient vertical scrollbar can never spawn and
               widen the stage by its gutter (~4-16px) mid-transition — the
               documented cause of the end-of-morph 16px "teleport" hitch.
               scrollbar-gutter: stable is belt-and-suspenders for any edge-case
               overflow recalculation (bounded to the styled 4px via
               nocturne-scroll). h-full/max-h-full are inert under flex-basis:0
               but pin the viewport contract per spec. */
            className="stage-enter flex h-full max-h-full min-h-0 flex-1 flex-col items-center justify-center p-6 md:p-8 gap-2 sm:gap-4 overflow-hidden nocturne-scroll relative select-none"
            style={{ scrollbarGutter: 'stable' }}
          >
            {/* Apple-Style Dynamic Island Synced Lyrics */}
            <DynamicIslandLyrics
              isExpanded={isLyricsExpanded}
              onExpandChange={setLyricsOpen}
            />

            {/* Split-Stage Motion Container: artwork + reflection + track info glide
                left as one unit while the lyrics island claims the right stage.
                Full-height flex wrapper preserves the original vertical thirds
                distribution (my-auto / mb-auto) and transforms as a whole, so the
                TiltCard, floor reflection, shadow, and metadata travel seamlessly.
                GPU layer isolation: transform-gpu + will-change-transform +
                backface-visibility hidden (Tailwind 3.4 ships no
                backface-visibility utility, so the arbitrary property form
                emits the exact declaration) — the left-shift never
                re-rasterizes artwork.
                `opacity` is the track-swap cross-fade (instant hide, smooth
                reveal) — no remount, no layout thrash on skip.
                No dimming/blur — artwork stays at full opacity like the reference. */}
            <div
              ref={motionWrapperRef}
              className={cn(
                'transform-gpu will-change-transform [backface-visibility:hidden] relative flex min-h-0 flex-1 flex-col items-center gap-2 sm:gap-4',
                isLyricsExpanded &&
                  '-translate-x-[135px] sm:-translate-x-[155px] md:-translate-x-[175px] scale-[0.88]'
              )}
              style={{
                opacity: swapFade,
                pointerEvents: swapFade === 1 ? undefined : 'none',
                // GPU-ONLY: the lyrics morph is a translate+scale, so width /
                // height / right / top are deliberately NOT transitioned. Those
                // layout properties used to keep easing for 380ms after a
                // maximize/restore, so the stage box lagged the snapped native
                // frame and clipped. Opacity crossfade + transform are unaffected.
                transition: `transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${swapFade === 1 ? '300ms ease' : '0ms'}`
              }}
            >
              {/* Artwork block: Adaptive Ambient Glow + TiltCard + floor reflection.
                  min-h-0 releases the flex min-height:auto floor so the block
                  can genuinely shrink in short windows; shrink-0 on TiltCard
                  keeps the album cover a perfect square (overflow is absorbed
                  by the stage's permanent overflow-hidden, never a scrollbar). */}
              <div className="relative my-auto flex min-h-0 flex-col items-center">
                {/* Adaptive Artwork Ambient Glow — dual-emitter aura dyed by the
                    track's extracted palette, absolutely positioned behind the
                    artwork (pointer-events-none, zero layout geometry). */}
                <AmbientGlow
                  primary={ambientPalette.primary}
                  secondary={ambientPalette.secondary}
                  intensity={0.55}
                  pulsing={isPlaying}
                  className="inset-[-40px]"
                />

                <TiltCard
                  data-stage-cover="true"
                  className="relative aspect-square shrink-0 w-56 sm:w-64 md:w-72 max-w-[320px] rounded-2xl cursor-pointer"
                >
                  <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.8)] bg-[#121419]">
                    {coverSrc ? (
                      <img
                        ref={coverImgRef}
                        data-stage-cover="true"
                        src={decodedCover ?? coverSrc}
                        alt={currentTrack.title}
                        draggable={false}
                        decoding="async"
                        onError={() => rawCoverSrc && setFailedCoverSrc(rawCoverSrc)}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
                        <Disc3 size={48} className="text-muted/50" />
                      </div>
                    )}
                  </div>
                </TiltCard>

                {/* Cinematic Mirror Floor Reflection with Zero-Layout-Shift Constraint */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none select-none relative w-56 sm:w-64 md:w-72 max-w-[320px] h-0 overflow-visible"
                >
                  <div
                    style={{
                      WebkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.38) 0%, transparent 60%)',
                      maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.38) 0%, transparent 60%)',
                      transform: 'scaleY(-1) translateY(-100%)',
                      transformOrigin: 'top',
                    }}
                    className="aspect-square w-full rounded-2xl overflow-hidden blur-[1.5px] opacity-30 mt-1"
                  >
                    {coverSrc ? (
                      <img
                        src={decodedCover ?? coverSrc}
                        alt=""
                        draggable={false}
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
                        <Disc3 size={48} className="text-muted/50" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Single-line fixed-height track info slots — travels with the
                  artwork, never dimmed. min-h-0 lets the text block flex-shrink
                  inside short viewports instead of forcing stage overflow. */}
              <div className="flex min-h-0 flex-col items-center text-center max-w-lg w-full px-4 mb-auto">
                <Marquee
                  dir="auto"
                  className="max-w-full text-xl md:text-2xl font-bold tracking-tight text-ink"
                >
                  {currentTrack.title}
                </Marquee>
                <Marquee
                  dir="auto"
                  className="mt-1 max-w-full text-sm font-medium text-muted"
                >
                  {currentTrack.artist}
                </Marquee>

                {/* Studio Metadata Line */}
                <div className="mt-3 text-[11px] text-slate-500 font-mono tracking-tight select-none">
                  Local Studio Audio • 24-bit Passthrough
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-surface/50 text-faint mb-4">
              <Music size={28} />
            </span>
            <h3 className="text-base font-semibold text-ink">Your night starts quiet</h3>
            <p className="text-xs text-muted max-w-sm mt-1 mb-5">
              Select any song from your library or queue to start the cinematic stage experience.
            </p>
            {onAddFolder && (
              <button
                type="button"
                onClick={onAddFolder}
                disabled={scanning}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-raised/80 px-4 text-xs font-semibold text-ink hover:bg-line transition-colors"
              >
                <span>{scanning ? 'Scanning…' : 'Add Music Folder'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Library table — persistent pane (keeps its scroll position) */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          view === 'library' ? 'flex' : 'hidden'
        )}
        aria-hidden={view !== 'library'}
      >
        {libraryContent}
      </div>

      {/* Listening stats — persistent pane */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          view === 'stats' ? 'flex' : 'hidden'
        )}
        aria-hidden={view !== 'stats'}
      >
        <StatsDashboard />
      </div>
    </div>
  )
}

export default CenterIsland
