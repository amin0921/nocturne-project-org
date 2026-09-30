import React from 'react'
import { Disc3 } from 'lucide-react'
import { cn } from '../../lib/utils'

export type HistoryStatus = 'completed' | 'skipped' | 'partial'

export interface HistoryRowData {
  id: number
  trackId: string
  title: string
  artist: string
  durationSecs: number
  durationListenedSecs: number
  /** Unix epoch seconds. */
  playedAt: number
  status: HistoryStatus
  coverUrl?: string
}

export interface HistoryRowProps {
  entry: HistoryRowData
  /** Position in the list — drives the staggered mount delay (capped at 8). */
  index: number
  /** Precomputed relative time string ("just now", "5m ago", "yesterday"). */
  relative: string
  /** Total recorded plays for this track across ALL raw history rows. */
  playCount?: number
  onClick: () => void
}

const STATUS_LABEL: Record<HistoryStatus, string> = {
  completed: 'Completed',
  skipped: 'Skipped',
  partial: 'Partial'
}

/**
 * HistoryRow — one SQLite-backed play session. Obsidian surface (#121419)
 * with a subtle hover lift (translateY(-1px) + amber border glow, transform
 * only); clicking plays the track immediately.
 */
export function HistoryRow({ entry, index, relative, playCount, onClick }: HistoryRowProps): JSX.Element {
  const completed = entry.status === 'completed'
  return (
    <li
      className="history-row-enter"
      style={{ '--row-index': Math.min(index, 7) } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={onClick}
        className="history-row"
        aria-label={`Play ${entry.title}`}
        title={`${STATUS_LABEL[entry.status]} — heard ${Math.round(entry.durationListenedSecs)}s of ${Math.round(entry.durationSecs)}s`}
      >
        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-white/30">
          {entry.coverUrl ? (
            <img src={entry.coverUrl} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <Disc3 size={16} aria-hidden />
          )}
        </div>

        <span className="meta flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs font-semibold text-ink" dir="auto">
            {entry.title}
          </span>
          <span className="truncate text-[11px] text-faint" dir="auto">
            {entry.artist}
          </span>
        </span>

        {playCount !== undefined && (
          <span
            className="numeric shrink-0 font-mono text-[10px] font-medium text-faint"
            title={`${playCount} recorded play${playCount === 1 ? '' : 's'}`}
          >
            ×{playCount}
          </span>
        )}

        <span
          className={cn(
            'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
            completed
              ? 'border-[#EAB308]/40 bg-[#EAB308]/10 text-[#EAB308]'
              : 'border-[#A8B0BE]/25 bg-[#A8B0BE]/10 text-[#A8B0BE]'
          )}
        >
          {STATUS_LABEL[entry.status]}
        </span>

        <span className="numeric shrink-0 font-mono text-[11px] tabular-nums text-faint" dir="ltr">
          {relative}
        </span>
      </button>
    </li>
  )
}

export default HistoryRow
