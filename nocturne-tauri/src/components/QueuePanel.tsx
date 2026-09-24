import React, { useEffect } from 'react'
import { AudioWaveform, X } from 'lucide-react'
import { usePlayerStore, type PlayerTrack } from '../stores/usePlayerStore'
import { useUIStore, type RightPanelTab } from '../stores/useUIStore'
import { resolveCoverUrl } from '../utils/cover-url'
import { cn } from '../lib/utils'
import { MagneticQueue } from './queue/MagneticQueue'
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

export interface QueuePanelProps {
  onClose?: () => void
  className?: string
}

/**
 * QueuePanel Component (Multi-Tab Studio Header in Right Island)
 * Evolved into a 3-tab studio desktop panel:
 * 1. Up Next: Magnetic Queue (hand-rolled FLIP drag-reorder + clickable play)
 * 2. Lyrics: Synchronized LRC lyrics view with progressive edge masks
 * 3. Specs: Studio audio inspector card for format, sample rate, bitrate, channels, and lossless status
 */
export function QueuePanel({ onClose, className }: QueuePanelProps): JSX.Element {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.index)

  const activeTab = useUIStore((s) => s.rightTab)
  const setActiveTab = useUIStore((s) => s.setRightTab)

  // Warm the next 4 covers
  usePreloadCovers(queue.slice(Math.max(0, currentIndex + 1), currentIndex + 5))

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
                  'numeric font-mono text-[9px] px-1 py-0.2 rounded-full tabular-nums font-semibold shrink-0 transition-colors',
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
        {/* Tab 1 View — Up Next Magnetic Queue (FLIP drag-reorder + click-to-play) */}
        {activeTab === 'queue' && <MagneticQueue />}

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
