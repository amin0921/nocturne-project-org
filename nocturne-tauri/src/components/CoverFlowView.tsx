import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Disc3, Music, Play, X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Track } from '../types/player'
import { formatTime } from '../types/player'
import { usePlayerStore } from '../stores/usePlayerStore'
import { resolveCoverUrl } from '../utils/cover-url'
import { WindowGripPill } from './WindowGripPill'
import { cn } from '../lib/utils'

export interface CoverFlowViewProps {
  tracks?: Track[]
  activeTrackId?: number | string | null
  activeIndex?: number
  onSelectTrack: (track: Track, index: number) => void
  onDismiss: () => void
}

/**
 * 3D CoverFlow Carousel Overlay
 * Pure React + CSS 3D Transforms (No Three.js / Canvas).
 * Bulletproofed against empty/undefined tracks and out-of-bounds index errors.
 */
export default function CoverFlowView({
  tracks = [],
  activeTrackId,
  activeIndex,
  onSelectTrack,
  onDismiss
}: CoverFlowViewProps): JSX.Element {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentPlayingId = usePlayerStore((s) => s.currentTrack?.id)

  const safeTracks = useMemo(() => {
    return Array.isArray(tracks) ? tracks.filter((t): t is Track => Boolean(t && (t.id !== undefined || t.title !== undefined))) : []
  }, [tracks])

  // Find initial index matching activeIndex or activeTrackId or fallback to 0
  const initialIndex = useMemo(() => {
    if (safeTracks.length === 0) return 0
    if (activeIndex !== undefined && activeIndex !== null && Number.isFinite(activeIndex)) {
      return Math.max(0, Math.min(safeTracks.length - 1, activeIndex))
    }
    if (activeTrackId !== undefined && activeTrackId !== null) {
      const idx = safeTracks.findIndex((t) => t?.id === activeTrackId)
      if (idx >= 0) return idx
    }
    return 0
  }, [safeTracks, activeIndex, activeTrackId])

  const [selectedIndex, setSelectedIndex] = useState<number>(initialIndex)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync if activeTrackId or tracks change externally
  useEffect(() => {
    if (safeTracks.length === 0) {
      setSelectedIndex(0)
      return
    }
    if (activeTrackId !== undefined && activeTrackId !== null) {
      const idx = safeTracks.findIndex((t) => t?.id === activeTrackId)
      if (idx >= 0) {
        setSelectedIndex(idx)
        return
      }
    }
    setSelectedIndex((prev) => Math.max(0, Math.min(safeTracks.length - 1, prev)))
  }, [activeTrackId, safeTracks])

  const goToNext = useCallback(() => {
    setSelectedIndex((prev) => (safeTracks.length > 0 ? Math.min(safeTracks.length - 1, prev + 1) : 0))
  }, [safeTracks.length])

  const goToPrev = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1))
  }, [])

  // React keyboard navigation handler for CoverFlow container and controls
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        goToNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        goToPrev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        setSelectedIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        setSelectedIndex(safeTracks.length > 0 ? safeTracks.length - 1 : 0)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        onDismiss?.()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        const selected = safeTracks[selectedIndex]
        if (selected && onSelectTrack) {
          onSelectTrack(selected, selectedIndex)
        }
      }
    },
    [goToNext, goToPrev, onDismiss, onSelectTrack, safeTracks, selectedIndex]
  )

  // Window capture-phase keyboard listener: intercepts navigation hotkeys before
  // bubbling to global transport listeners (e.g. useStudioHotkeys seek)
  useEffect(() => {
    function handleWindowKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        goToNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        goToPrev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        setSelectedIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        setSelectedIndex(safeTracks.length > 0 ? safeTracks.length - 1 : 0)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onDismiss?.()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        const selected = safeTracks[selectedIndex]
        if (selected && onSelectTrack) {
          onSelectTrack(selected, selectedIndex)
        }
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown, true)
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true)
  }, [goToNext, goToPrev, onDismiss, onSelectTrack, safeTracks, selectedIndex])

  // Focus container for accessibility
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  const clampedIndex = safeTracks.length > 0 ? Math.max(0, Math.min(safeTracks.length - 1, selectedIndex)) : 0
  const currentTrack = safeTracks[clampedIndex] ?? null
  const isSelectedTrackPlaying = Boolean(currentTrack && isPlaying && currentTrack.id === currentPlayingId)

  // Visible window of cards around selectedIndex (render up to ±4 cards for 60fps performance)
  const maxVisibleOffset = 4
  const visibleCards = useMemo(() => {
    if (safeTracks.length === 0) return []
    const cards: { track: Track; index: number; offset: number }[] = []
    for (let i = 0; i < safeTracks.length; i++) {
      const offset = i - clampedIndex
      if (Math.abs(offset) <= maxVisibleOffset) {
        cards.push({ track: safeTracks[i], index: i, offset })
      }
    }
    return cards
  }, [safeTracks, clampedIndex])

  // Generate indicator dots range around selectedIndex (up to 9 dots)
  const indicatorDots = useMemo(() => {
    if (safeTracks.length <= 1) return []
    const count = Math.min(9, safeTracks.length)
    const half = Math.floor(count / 2)
    let start = clampedIndex - half
    let end = clampedIndex + half

    if (start < 0) {
      end += -start
      start = 0
    }
    if (end >= safeTracks.length) {
      start = Math.max(0, start - (end - safeTracks.length + 1))
      end = safeTracks.length - 1
    }
    const dots: number[] = []
    for (let i = start; i <= end; i++) {
      dots.push(i)
    }
    return dots
  }, [safeTracks.length, clampedIndex])

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="3D CoverFlow Carousel"
      data-coverflow="true"
      onKeyDown={onKeyDown}
      className="coverflow-container fixed inset-0 z-50 flex items-center justify-center pointer-events-none select-none outline-none border-0 shadow-none bg-transparent"
    >
      {/* Detached floating glass island: single boundary element with 100% solid dark opaque surface */}
      <div
        data-coverflow="true"
        onKeyDown={onKeyDown}
        className="coverflow-container relative m-4 flex h-[calc(100%-2rem)] w-[calc(100%-2rem)] flex-col items-center justify-between rounded-3xl border border-white/10 overflow-hidden bg-[#0A0B0E] pointer-events-auto p-4 md:p-6 shadow-none outline-none ring-0"
      >
        {/* Top Bar with Badge, Drag Handle Pill, and Close button (reserves pr-28 clearance for top-right window controls) */}
        <header className="relative z-20 flex w-full max-w-6xl items-center justify-between px-2 pt-1 pr-28 select-none border-none outline-none">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-slate-400/70 select-none">
              CoverFlow Showcase
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-faint numeric">
              {safeTracks.length > 0 ? `${clampedIndex + 1} / ${safeTracks.length}` : '0 / 0'}
            </span>
          </div>

          <WindowGripPill label="CoverFlow" className="hidden sm:flex" />

          <button
            type="button"
            onClick={onDismiss}
            onKeyDown={onKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="group pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#121419] text-muted shadow-lg transition-all hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline-none"
            aria-label="Close CoverFlow view"
            title="Close (Esc)"
          >
            <X size={18} className="transition-transform group-hover:rotate-90 duration-200" aria-hidden />
          </button>
        </header>

        {/* Main 3D Stage */}
        <div className="relative flex flex-1 w-full max-w-5xl items-center justify-center [perspective:1200px] overflow-visible my-auto">
          {safeTracks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[#121419] shadow-2xl text-faint">
                <Music size={28} />
              </span>
              <p className="text-sm font-semibold text-ink">کتابخانه شما خالی است / No tracks available</p>
              <p className="text-xs text-muted max-w-sm">
                Add music folders in the library view to explore album artwork in 3D CoverFlow.
              </p>
              <button
                type="button"
                onClick={onDismiss}
                className="mt-2 flex h-8 items-center justify-center rounded-lg border border-white/10 bg-raised/90 px-4 text-xs font-medium text-ink hover:bg-line transition-colors"
              >
                Close / بستن
              </button>
            </div>
          ) : (
            <div
              role="listbox"
              data-coverflow="true"
              aria-label="CoverFlow Albums"
              tabIndex={-1}
              onKeyDown={onKeyDown}
              className="coverflow-container relative flex items-center justify-center w-full h-80 md:h-96"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {visibleCards.map(({ track, index, offset }) => {
                const isCenter = offset === 0
                const isLeft = offset < 0
                const isRight = offset > 0

                // Calculate 3D transforms relative to screen center
                let translateX = 0
                let translateZ = 0
                let rotateY = 0
                let scale = 1
                let opacity = 1
                let zIndex = 20 - Math.abs(offset)

                if (isCenter) {
                  translateX = 0
                  translateZ = 0
                  rotateY = 0
                  scale = 1
                  zIndex = 40
                  opacity = 1
                } else if (isLeft) {
                  translateX = Math.round(offset * 140 - 70)
                  translateZ = Math.round(-Math.abs(offset) * 80)
                  rotateY = 35
                  scale = Math.max(0.72, 1 - Math.abs(offset) * 0.08)
                  opacity = Math.max(0.25, 1 - Math.abs(offset) * 0.22)
                } else if (isRight) {
                  translateX = Math.round(offset * 140 + 70)
                  translateZ = Math.round(-Math.abs(offset) * 80)
                  rotateY = -35
                  scale = Math.max(0.72, 1 - Math.abs(offset) * 0.08)
                  opacity = Math.max(0.25, 1 - Math.abs(offset) * 0.22)
                }

                const trackTitle = track?.title ?? 'Unknown Title'
                const trackArtist = track?.artist ?? 'Unknown Artist'
                const trackKey = track?.id !== undefined ? `track-${track.id}` : `track-idx-${index}`

                return (
                  <div
                    key={trackKey}
                    data-coverflow="true"
                    onKeyDown={onKeyDown}
                    onClick={() => {
                      if (isCenter) {
                        onSelectTrack(track, index)
                      } else {
                        setSelectedIndex(index)
                      }
                    }}
                    style={{
                      transform: isCenter
                        ? 'translate3d(-50%, -50%, 0px)'
                        : `translate3d(calc(-50% + ${translateX}px), -50%, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                      zIndex,
                      opacity,
                      transformStyle: isCenter ? 'flat' : 'preserve-3d',
                      WebkitFontSmoothing: 'antialiased',
                      textRendering: 'optimizeLegibility'
                    }}
                    className={cn(
                      'absolute top-1/2 left-1/2',
                      'w-64 h-64 md:w-80 md:h-80',
                      'cursor-pointer transition-all duration-300 ease-out select-none'
                    )}
                    aria-label={`${trackTitle} by ${trackArtist}`}
                    role="button"
                    tabIndex={isCenter ? 0 : -1}
                  >
                    {/* Spinning vinyl record peaking from behind center card when playing */}
                    {isCenter && (
                      <div
                        className={cn(
                          'absolute right-0 top-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] rounded-full border border-white/10 bg-[#0A0B0E] shadow-2xl transition-all duration-500',
                          isSelectedTrackPlaying
                            ? 'translate-x-12 animate-vinyl-spin opacity-95'
                            : 'translate-x-0 opacity-0 pointer-events-none'
                        )}
                        style={{
                          background:
                            'radial-gradient(circle, #0A0B0E 25%, #161922 28%, #0A0B0E 32%, #1a1e27 45%, #0A0B0E 50%, #1f2533 65%, #0A0B0E 72%)',
                          zIndex: -1
                        }}
                        aria-hidden
                      >
                        <div className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber/40 bg-ember/20 shadow-inner">
                          <Disc3 size={20} className="text-ember" />
                        </div>
                      </div>
                    )}

                    {/* Album Cover Card */}
                    <div
                      style={{
                        WebkitFontSmoothing: 'antialiased',
                        textRendering: 'optimizeLegibility'
                      }}
                      className={cn(
                        'relative h-full w-full overflow-hidden rounded-2xl border transition-all duration-300',
                        'bg-gradient-to-b from-[#1A1E27] to-[#121419]',
                        isCenter
                          ? 'border-ember/70 shadow-[0_0_50px_-10px_rgba(234,179,8,0.4)]'
                          : 'border-white/15 shadow-2xl hover:border-white/20'
                      )}
                    >
                      <CoverFlowCardArtwork
                        track={track}
                        isCenter={isCenter}
                        trackTitle={trackTitle}
                        trackArtist={trackArtist}
                      />

                      {/* Play action hover badge on center card */}
                      {isCenter && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100 duration-200">
                          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ember text-base shadow-xl transition-transform hover:scale-110 active:scale-95">
                            <Play size={24} className="ml-1 fill-current" />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        {/* Previous & Next Floating Chevron Controls */}
        {safeTracks.length > 1 && (
          <>
            <button
              type="button"
              onClick={goToPrev}
              onKeyDown={onKeyDown}
              disabled={clampedIndex === 0}
              className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-30 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#121419] text-muted shadow-2xl transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 focus-visible:outline-none"
              aria-label="Previous album"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button
              type="button"
              onClick={goToNext}
              onKeyDown={onKeyDown}
              disabled={clampedIndex === safeTracks.length - 1}
              className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-30 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#121419] text-muted shadow-2xl transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 focus-visible:outline-none"
              aria-label="Next album"
            >
              <ChevronRight size={22} aria-hidden />
            </button>
          </>
        )}
      </div>

      {/* Bottom Information & Position Dots */}
      <footer className="relative z-20 flex w-full max-w-md flex-col items-center gap-3 pb-2 text-center">
        {currentTrack ? (
          <div
            style={{
              WebkitFontSmoothing: 'antialiased',
              textRendering: 'optimizeLegibility'
            }}
            className="flex flex-col items-center max-w-full px-4"
          >
            <h2
              dir="auto"
              className="text-xl md:text-2xl font-bold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate w-full"
            >
              {currentTrack.title ?? 'Unknown Title'}
            </h2>
            <p
              dir="auto"
              className="text-sm text-slate-300 font-medium tracking-normal drop-shadow-md truncate w-full mt-1"
            >
              {currentTrack.artist ?? 'Unknown Artist'}
              {currentTrack.album && currentTrack.album !== 'Unknown Album' ? (
                <span className="text-[#6B7484]"> • {currentTrack.album}</span>
              ) : null}
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-xs text-faint">
              <span className="numeric font-medium text-muted">
                {formatTime(currentTrack.duration_secs ?? currentTrack.duration)}
              </span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <button
                type="button"
                onClick={() => onSelectTrack(currentTrack, clampedIndex)}
                className="font-semibold text-ember hover:text-emberhover transition-colors"
              >
                {isSelectedTrackPlaying ? 'Now Playing' : 'Play Track'}
              </button>
            </div>
          </div>
        ) : (
          <div className="h-12" />
        )}

        {/* Position Indicator Dots */}
        {indicatorDots.length > 1 && (
          <div
            className="flex items-center gap-1.5 pt-1"
            role="tablist"
            aria-label="Carousel pagination"
          >
            {indicatorDots.map((dotIdx) => {
              const active = dotIdx === clampedIndex
              return (
                <button
                  key={`dot-${dotIdx}`}
                  type="button"
                  onClick={() => setSelectedIndex(dotIdx)}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200 focus-visible:outline-none',
                    active
                      ? 'w-6 bg-ember shadow-[0_0_8px_rgba(234,179,8,0.8)]'
                      : 'w-1.5 bg-white/20 hover:bg-white/40'
                  )}
                  aria-label={`Jump to album ${dotIdx + 1}`}
                  aria-selected={active}
                  role="tab"
                />
              )
            })}
          </div>
        )}
      </footer>
    </div>
  </div>
  )
}

interface CoverFlowCardArtworkProps {
  track: Track
  isCenter: boolean
  trackTitle: string
  trackArtist: string
}

function CoverFlowCardArtwork({
  track,
  isCenter,
  trackTitle,
  trackArtist
}: CoverFlowCardArtworkProps): JSX.Element {
  const [imgError, setImgError] = useState(false)
  const resolvedCover = !imgError ? resolveCoverUrl(track?.coverUrl) : undefined

  if (resolvedCover) {
    return (
      <div className="relative h-full w-full">
        <img
          src={resolvedCover}
          alt={trackTitle}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        <div
          style={{
            WebkitFontSmoothing: 'antialiased',
            textRendering: 'optimizeLegibility'
          }}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-8"
        >
          <p
            dir="auto"
            className={cn(
              'line-clamp-1 w-full',
              isCenter
                ? 'text-white font-bold text-lg tracking-normal drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
                : 'text-white/80 text-sm font-medium'
            )}
          >
            {trackTitle}
          </p>
          <p
            dir="auto"
            className={cn(
              'line-clamp-1 w-full mt-1',
              isCenter
                ? 'text-slate-300 font-medium text-xs tracking-normal'
                : 'text-slate-400 text-xs'
            )}
          >
            {trackArtist}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'optimizeLegibility'
      }}
      className="flex h-full w-full flex-col items-center justify-center p-6 text-center relative overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, transparent 30%, rgba(255,255,255,0.08) 32%, transparent 34%, rgba(255,255,255,0.06) 48%, transparent 50%, rgba(255,255,255,0.08) 64%, transparent 66%)'
        }}
      />
      <span
        className={cn(
          'mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border transition-all duration-300',
          isCenter
            ? 'border-ember/40 bg-ember/10 text-ember shadow-[0_0_24px_rgba(234,179,8,0.3)]'
            : 'border-white/15 bg-surface/50 text-faint'
        )}
      >
        <Music size={32} />
      </span>
      <p
        dir="auto"
        className={cn(
          'line-clamp-2 w-full px-2',
          isCenter
            ? 'text-white font-bold text-lg tracking-normal drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
            : 'text-ink/80 text-sm font-medium'
        )}
      >
        {trackTitle}
      </p>
      <p
        dir="auto"
        className={cn(
          'mt-1.5 line-clamp-1 w-full px-2',
          isCenter
            ? 'text-slate-300 font-medium text-xs tracking-normal'
            : 'text-slate-400 text-xs'
        )}
      >
        {trackArtist}
      </p>
    </div>
  )
}

