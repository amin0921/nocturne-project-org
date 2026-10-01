import React, { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { History as HistoryIcon, Trash2 } from 'lucide-react'
import {
  playNext,
  playTrackAt,
  usePlayerStore,
  type PlayerTrack
} from '../../stores/usePlayerStore'
import { resolveCoverUrl } from '../../utils/cover-url'
import { EmptyState } from '../empty/EmptyState'
import { HistoryRow, type HistoryRowData, type HistoryStatus } from './HistoryRow'

/** Row shape returned by the Rust `get_listening_history` command (camelCase). */
interface ApiHistoryEntry {
  id: number
  trackId: string
  title: string
  artist: string
  durationSecs: number
  durationListenedSecs: number
  playedAt: number
  status: string
}

/** Relative time strings per the research spec; `now` is injected by the panel. */
function relativeTime(playedAtSecs: number, nowMs: number): string {
  const seconds = Math.floor(Math.max(0, nowMs - playedAtSecs * 1000) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'yesterday'
  return `${Math.floor(hours / 24)}d ago`
}

function asStatus(raw: string): HistoryStatus {
  return raw === 'completed' || raw === 'skipped' || raw === 'partial' ? raw : 'partial'
}

export interface HistoryPanelProps {
  /** Resolve a history path back to its full library track (covers, real id). */
  resolveTrack?: (path: string) => PlayerTrack | undefined
  /** Reports the fetched row count (drives the History tab badge). */
  onEntriesChange?: (count: number) => void
}

/** Number of DISTINCT tracks displayed; fetch window is the backend's 500-row clamp. */
const MAX_DISTINCT_ROWS = 50

/**
 * Group raw play events into DISTINCT tracks keyed by canonical path.
 * Rows arrive newest-first, so the first sighting of a track is its latest
 * session. Status: 'completed' if ANY recorded session completed, else the
 * latest session's status. Raw SQLite rows are never touched — grouping is
 * view-only. Map iteration preserves insertion order = newest-first.
 */
function groupByTrack(rows: ApiHistoryEntry[]): ApiHistoryEntry[] {
  const byTrack = new Map<string, { latest: ApiHistoryEntry; anyCompleted: boolean }>()
  for (const row of rows) {
    const existing = byTrack.get(row.trackId)
    if (!existing) {
      byTrack.set(row.trackId, { latest: row, anyCompleted: row.status === 'completed' })
    } else if (row.status === 'completed') {
      existing.anyCompleted = true
    }
  }
  return Array.from(byTrack.values(), ({ latest, anyCompleted }) => ({
    ...latest,
    status: anyCompleted ? 'completed' : latest.status
  })).slice(0, MAX_DISTINCT_ROWS)
}

/**
 * HistoryPanel — persistent listening history backed by SQLite
 * (`get_listening_history`, fetch window 500 raw events, grouped to at most
 * 50 DISTINCT tracks).
 *
 * Fetch discipline: one fetch on mount and one per playback-finish moment
 * (track change / natural stop) — never periodic. The ONLY interval is a
 * 1/60 Hz clock that recomputes relative-time strings locally.
 */
export function HistoryPanel({ resolveTrack, onEntriesChange }: HistoryPanelProps): JSX.Element {
  const [entries, setEntries] = useState<HistoryRowData[] | null>(null)
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => Date.now())

  // Refetch triggers: track identity changes and true->false play transitions.
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const reportCount = useRef(onEntriesChange)
  reportCount.current = onEntriesChange

  const fetchHistory = useCallback(async (): Promise<void> => {
    try {
      const rows = await invoke<ApiHistoryEntry[]>('get_listening_history', { limit: 500 })
      const mapped: HistoryRowData[] = groupByTrack(rows).map((row) => {
        const library = resolveTrack?.(row.trackId)
        return {
          id: row.id,
          trackId: row.trackId,
          title: row.title,
          artist: row.artist,
          durationSecs: row.durationSecs,
          durationListenedSecs: row.durationListenedSecs,
          playedAt: row.playedAt,
          status: asStatus(row.status),
          coverUrl: library ? resolveCoverUrl(library.coverUrl) ?? library.coverUrl : undefined
        }
      })
      setEntries(mapped)
      reportCount.current?.(mapped.length)
      // Play counts: one indexed COUNT per distinct track, fetched once per
      // refresh in a single bounded burst (<= 50 invokes, mount/finish only).
      // The total spans ALL raw history rows, not just the fetched window.
      const distinct = Array.from(new Set(mapped.map((r) => r.trackId)))
      const pairs = await Promise.all(
        distinct.map(async (trackId) => {
          try {
            return [trackId, await invoke<number>('get_track_play_count', { trackId })] as const
          } catch {
            return [trackId, 1] as const
          }
        })
      )
      setPlayCounts(Object.fromEntries(pairs))
    } catch (err) {
      console.debug('[HistoryPanel] get_listening_history failed:', err)
      setEntries([])
      reportCount.current?.(0)
    }
  }, [resolveTrack])

  // Mount + every track change (the telemetry flush fires at that moment).
  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory, currentTrackId])

  // Natural stop without a track change (end of queue) also flushes a record.
  const prevPlayingRef = useRef(isPlaying)
  useEffect(() => {
    if (prevPlayingRef.current && !isPlaying) void fetchHistory()
    prevPlayingRef.current = isPlaying
  }, [isPlaying, fetchHistory])

  // 1/60 Hz relative-time clock — display only, no IPC.
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [entries])

  /** Wipe every history row via IPC and drop straight into the EmptyState. */
  const clearHistory = useCallback(async (): Promise<void> => {
    try {
      await invoke<number>('clear_listening_history')
      setEntries([])
      setPlayCounts({})
      reportCount.current?.(0)
    } catch (err) {
      console.debug('[HistoryPanel] clear_listening_history failed:', err)
    }
  }, [])

  const playEntry = useCallback(
    (entry: HistoryRowData): void => {
      const { queue } = usePlayerStore.getState()
      const queuedAt = queue.findIndex((t) => t.path === entry.trackId)
      if (queuedAt >= 0) {
        void playTrackAt(queuedAt)
        return
      }
      const library = resolveTrack?.(entry.trackId)
      if (library) {
        // Priority tier + step in: the context album order stays intact.
        playNext(library)
        void usePlayerStore.getState().next()
        return
      }
      // Track left the library: play from its canonical path via a minimal
      // stand-in row (sentinel id — stats/favorites cannot attach to it).
      playNext({
        id: -1,
        path: entry.trackId,
        title: entry.title,
        artist: entry.artist,
        album: '',
        duration_secs: entry.durationSecs > 0 ? entry.durationSecs : null,
        missing: 0
      })
      void usePlayerStore.getState().next()
    },
    [resolveTrack]
  )

  if (entries !== null && entries.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon size={20} aria-hidden />}
        title="No listening history yet"
        description="Songs you play will appear here with completion and timestamp details"
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end px-1 pb-1.5">
        <button
          type="button"
          onClick={() => void clearHistory()}
          className="flex h-6 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-faint transition-colors hover:bg-white/10 hover:text-ink focus-visible:outline-none"
          aria-label="Clear listening history"
        >
          <Trash2 size={12} aria-hidden />
          <span>Clear History</span>
        </button>
      </div>
      <ul className="history-list flex min-h-0 flex-1 flex-col gap-1.5" aria-label="Recently played">
        {/* Keyed by canonical path (not session id): a replay MOVES the existing
            row to the top instead of remounting it — no re-animation, no clones. */}
        {(entries ?? []).map((entry, index) => (
          <HistoryRow
            key={entry.trackId}
            entry={entry}
            index={index}
            relative={relativeTime(entry.playedAt, now)}
            playCount={playCounts[entry.trackId]}
            onClick={() => playEntry(entry)}
          />
        ))}
      </ul>
    </div>
  )
}

export default HistoryPanel
