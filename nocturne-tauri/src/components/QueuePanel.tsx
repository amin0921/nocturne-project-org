import React, { useEffect, useRef, useState } from 'react'
import { AudioWaveform, Disc3, Music, X } from 'lucide-react'
import { playTrackAt, usePlayerStore, type PlayerTrack } from '../stores/usePlayerStore'
import { useUIStore, type RightPanelTab } from '../stores/useUIStore'
import { formatTime } from '../types/player'
import { resolveCoverUrl } from '../utils/cover-url'
import { cn } from '../lib/utils'
import { EqBars } from './EqBars'
import { AudioSpecsView } from './AudioSpecsView'

/** Warm the browser cache for upcoming track covers so stage swap never flashes */
function usePreloadCovers(tracks: PlayerTrack[]): void {
  useEffect(() => {
    tracks.forEach((t) => {
      const src = resolveCoverUrl(t.coverUrl)
      if (src) {
        const img = new Image()
        img.src = src
      }
    })
  }, [tracks])
}

function QueueTrackThumbnail({ coverUrl, title }: { coverUrl?: string | null; title: string }) {
  const [imgError, setImgError] = useState(false)
  const resolved = !imgError ? resolveCoverUrl(coverUrl) : undefined

  return (
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#121419]">
      {resolved ? (
        <img
          src={resolved}
          alt={title}
          draggable={false}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
          <Disc3 size={14} className="text-faint/60" />
        </div>
      )}
    </div>
  )
}

export interface QueuePanelProps {
  onClose?: () => void
  className?: string
}

/**
 * QueuePanel Component (Multi-Tab Studio Header in Right Island)
 * Evolved into a 3-tab studio desktop panel:
 * 1. Up Next: Clickable play queue with upcoming count and active EqBars
 * 2. Lyrics: Synchronized LRC lyrics view with progressive edge masks
 * 3. Specs: Studio audio inspector card for format, sample rate, bitrate, channels, and lossless status
 */
export function QueuePanel({ onClose, className }: QueuePanelProps): JSX.Element {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.index)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const activeTab = useUIStore((s) => s.rightTab)
  const setActiveTab = useUIStore((s) => s.setRightTab)

  // Warm the next 4 covers
  usePreloadCovers(queue.slice(Math.max(0, currentIndex + 1), currentIndex + 5))

  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  // Auto-scroll to active track when currentIndex changes and Up Next tab is visible
  useEffect(() => {
    if (activeTab === 'queue' && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentIndex, activeTab])

  // Count of upcoming tracks (tracks following the current one)
  const upcomingCount = currentIndex >= 0
    ? Math.max(0, queue.length - 1 - currentIndex)
    : queue.length

  const tabIndex = activeTab === 'queue' ? 0 : 1

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden select-none', className)}>
      {/* Sliding Multi-Tab Header with dedicated right window controls clearance */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 pl-3',
          onClose ? 'pr-3' : 'pr-[116px]'
        )}
      >
        <div
          role="tablist"
          aria-label="Studio Views"
          className="relative flex flex-1 items-center rounded-xl bg-white/[0.04] p-1 border border-white/10 overflow-hidden"
        >
          {/* Category 1: Animated Tabs Sliding Amber Glass Indicator Pill (2 Tabs) */}
          <div
            className="absolute top-1 bottom-1 left-1 rounded-xl bg-[#EAB308]/15 border border-[#EAB308]/30 text-[#EAB308] shadow-[0_0_12px_rgba(234,179,8,0.12)] pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              width: 'calc((100% - 8px) / 2)',
              transform: `translateX(${tabIndex * 100}%)`
            }}
            aria-hidden="true"
          />

          {/* Tab 1: Up Next */}
          <button
            type="button"
            role="tab"
            id="tab-queue"
            aria-controls="panel-queue"
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-0.5 rounded-lg text-[11px] select-none transition-colors duration-200 outline-none focus-visible:ring-1 focus-visible:ring-ember min-w-0',
              activeTab === 'queue'
                ? 'font-bold text-[#F2F3F5]'
                : 'font-medium text-faint hover:text-ink'
            )}
          >
            <span className="truncate">Up Next</span>
            {queue.length > 0 && (
              <span
                className={cn(
                  'numeric text-[9px] px-1 py-0.2 rounded-full tabular-nums font-semibold shrink-0 transition-colors',
                  activeTab === 'queue'
                    ? 'bg-[#EAB308]/25 text-[#EAB308]'
                    : 'bg-white/10 text-faint'
                )}
              >
                {upcomingCount}
              </span>
            )}
          </button>

          {/* Tab 2: Specs */}
          <button
            type="button"
            role="tab"
            id="tab-specs"
            aria-controls="panel-specs"
            aria-selected={activeTab === 'specs'}
            onClick={() => setActiveTab('specs')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-0.5 rounded-lg text-[11px] select-none transition-colors duration-200 outline-none focus-visible:ring-1 focus-visible:ring-ember min-w-0',
              activeTab === 'specs'
                ? 'font-bold text-[#F2F3F5]'
                : 'font-medium text-faint hover:text-ink'
            )}
          >
            <AudioWaveform size={12} className={cn('shrink-0 transition-colors', activeTab === 'specs' ? 'text-ember' : 'text-faint')} aria-hidden />
            <span className="truncate">Specs</span>
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-white/10 hover:text-ink focus-visible:outline-none"
            aria-label="Close panel"
          >
            <X size={15} aria-hidden />
          </button>
        )}
      </div>

      {/* Main Tab View Container (Strict Anti-Jitter Layout Lock) */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative">
        {/* Tab 1 View — Up Next Queue List */}
        {activeTab === 'queue' && (
          <div
            role="tabpanel"
            id="panel-queue"
            aria-labelledby="tab-queue"
            className="nocturne-scroll min-h-0 flex-1 overflow-y-auto p-2 space-y-0.5"
            aria-label="Upcoming tracks"
          >
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-surface/50 text-faint mb-3">
                  <Music size={20} />
                </span>
                <p className="text-xs font-medium text-ink">Queue is empty</p>
                <p className="text-[11px] text-faint mt-1">Add tracks from the library to queue them.</p>
              </div>
            ) : (
              queue.map((track, i) => {
                const isActive = i === currentIndex
                return (
                  <button
                    key={`${track.id}-${i}`}
                    ref={isActive ? activeItemRef : undefined}
                    type="button"
                    role="listitem"
                    onClick={() => void playTrackAt(i)}
                    aria-current={isActive ? 'true' : undefined}
                    style={{
                      animationDelay: `${(i % 15) * 35}ms`
                    }}
                    className={cn(
                      'queue-item-enter group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 outline-none',
                      'focus-visible:ring-1 focus-visible:ring-ember',
                      isActive
                        ? 'bg-[#EAB308]/15 border border-[#EAB308]/30 text-ink shadow-[0_0_12px_rgba(234,179,8,0.1)]'
                        : 'border border-transparent text-muted hover:bg-white/5 hover:text-ink'
                    )}
                  >
                    <span
                      className={cn(
                        'numeric w-5 shrink-0 text-center text-xs tabular-nums',
                        isActive ? 'font-bold text-ember' : 'text-faint'
                      )}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <QueueTrackThumbnail coverUrl={track.coverUrl} title={track.title} />

                    <div className="min-w-0 flex-1">
                      <span
                        dir="auto"
                        className={cn(
                          'block truncate text-xs',
                          isActive ? 'font-semibold text-ember' : 'font-medium text-ink'
                        )}
                      >
                        {track.title}
                      </span>
                      <span dir="auto" className="block truncate text-[11px] text-faint mt-0.5">
                        {track.artist}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && <EqBars isPlaying={isPlaying} />}
                      <span className="numeric text-[11px] tabular-nums text-faint">
                        {formatTime(track.duration_secs)}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}

        {/* Tab 2 View — Technical Audio Specs */}
        {activeTab === 'specs' && (
          <div
            role="tabpanel"
            id="panel-specs"
            aria-labelledby="tab-specs"
            className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden"
          >
            <AudioSpecsView />
          </div>
        )}
      </div>
    </div>
  )
}

export default QueuePanel
