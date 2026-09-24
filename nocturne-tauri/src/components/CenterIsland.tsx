import React, { useState, useEffect } from 'react'
import { Disc3, MicVocal, Music } from 'lucide-react'
import { useUIStore } from '../stores/useUIStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { AmberBreath } from './ambient/AmberBreath'
import { ViewToggle } from './ViewToggle'
import { TiltCard } from './TiltCard'
import { Marquee } from './Marquee'
import { WindowGripPill } from './WindowGripPill'
import { DynamicIslandLyrics } from './DynamicIslandLyrics'
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
  const [imgError, setImgError] = useState(false)
  const isLyricsExpanded = useUIStore((s) => s.lyricsOpen)
  const setLyricsOpen = useUIStore((s) => s.setLyricsOpen)

  useEffect(() => {
    setImgError(false)
    setLyricsOpen(false)
  }, [currentTrack?.id, currentTrack?.coverUrl, setLyricsOpen])

  const coverSrc = !imgError ? resolveCoverUrl(currentTrack?.coverUrl) : undefined

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col select-none relative overflow-hidden', className)}>
      {/* Island Top Bar with Title, Drag Handle Pill, and View Toggle */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5 relative z-20">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[11px] font-medium tracking-[0.2em] text-slate-400/70 uppercase select-none shrink-0">
            {view === 'stage' ? 'Now Playing' : 'Library'}
          </h2>
          {view === 'stage' && currentTrack?.album && currentTrack.album !== 'Unknown Album' && (
            <span className="hidden sm:inline-block text-[11px] text-slate-500/80 font-mono tracking-tight truncate max-w-xs">
              / {currentTrack.album}
            </span>
          )}
        </div>

        <WindowGripPill label="Nocturne" className="hidden sm:flex" />

        <div className="pointer-events-auto shrink-0">
          <ViewToggle />
        </div>
      </div>

      {/* Main Content Area */}
      {view === 'stage' ? (
        currentTrack ? (
          <div
            key={currentTrack.id}
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
                No dimming/blur — artwork stays at full opacity like the reference. */}
            <div
              className={cn(
                'transform-gpu relative flex min-h-0 flex-1 flex-col items-center gap-2 sm:gap-4',
                isLyricsExpanded &&
                  '-translate-x-[135px] sm:-translate-x-[155px] md:-translate-x-[175px] scale-[0.88]'
              )}
              style={{
                transition:
                  'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), width 380ms cubic-bezier(0.16, 1, 0.3, 1), height 380ms cubic-bezier(0.16, 1, 0.3, 1), right 380ms cubic-bezier(0.16, 1, 0.3, 1), top 380ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 380ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 380ms cubic-bezier(0.16, 1, 0.3, 1)',
                willChange: 'transform',
                backfaceVisibility: 'hidden'
              }}
            >
              {/* Artwork block: Amber Breath aura + TiltCard + floor reflection.
                  min-h-0 releases the flex min-height:auto floor so the block
                  can genuinely shrink in short windows; shrink-0 on TiltCard
                  keeps the album cover a perfect square (overflow is absorbed
                  by the stage's permanent overflow-hidden, never a scrollbar). */}
              <div className="relative my-auto flex min-h-0 flex-col items-center">
                {/* Amber Breath sits absolutely behind the artwork (left 50% /
                    top 45% of this relative block) — pointer-events-none, zero
                    layout geometry, dispersion baked into the gradient stops. */}
                <AmberBreath playing={isPlaying} />

                <TiltCard className="relative aspect-square shrink-0 w-56 sm:w-64 md:w-72 max-w-[320px] rounded-2xl cursor-pointer">
                  <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.8)] bg-[#121419]">
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt={currentTrack.title}
                        draggable={false}
                        onError={() => setImgError(true)}
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
                        src={coverSrc}
                        alt=""
                        draggable={false}
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
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {libraryContent}
        </div>
      )}
    </div>
  )
}

export default CenterIsland
