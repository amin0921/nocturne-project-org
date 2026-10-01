import React, { useEffect, useRef, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { formatTime } from '../../types/player'
import { usePlayerStore, type PlayerTrack } from '../../stores/usePlayerStore'
import { cn } from '../../lib/utils'

export interface SessionRowData {
  id: number
  name: string
  trackCount: number
  durationSecs: number
  createdAt: number
  updatedAt: number
}

export interface SessionRowProps {
  session: SessionRowData
  /** Whether this row's track inspection panel is open. */
  expanded: boolean
  /** Tracks from the saved snapshot; null = not fetched yet / loading. */
  tracks: PlayerTrack[] | null
  onToggleExpand: (id: number) => void
  /** Replace the live queue with this session (restores playback position). */
  onReplace: (session: SessionRowData) => void
  /** Start playback of one session track (in-queue switch or append+play). */
  onPlayTrack: (track: PlayerTrack) => void
  onDelete: (id: number) => void
}

/** Must match the CSS hold fill duration in index.css (.hold-delete:active::before). */
const HOLD_CONFIRM_MS = 600

/**
 * SessionRow — one saved session. Clicking the row header EXPANDS an inline
 * inspection panel (lazy-fetched track list + playback actions) instead of
 * immediately overwriting the queue:
 *   - "Replace Queue"  → restores the session as the whole active queue.
 *   - Clicking a track → starts playback of that track immediately (switches
 *     to its queue row, or appends it first); the caller scrolls the queue
 *     list to the playing row. The sessions popover stays open throughout.
 *
 * Hold-to-Confirm delete: pressing and holding the trash button for 600ms
 * drives a CSS fill bar (.hold-delete:active::before, width 0% -> 100%);
 * a matching JS timer commits the deletion only if the hold completes.
 * Releasing early cancels both — the fill resets instantly because the
 * non-active state declares no transition.
 */
export function SessionRow({
  session,
  expanded,
  tracks,
  onToggleExpand,
  onReplace,
  onPlayTrack,
  onDelete
}: SessionRowProps): JSX.Element {
  const holdTimer = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  // Library id of the ACTIVE playing track — drives the amber "playing" hint.
  const playingTrackId = usePlayerStore((s) => s.currentTrack?.id)

  const cancelHold = useRef((): void => {})
  cancelHold.current = (): void => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setHolding(false)
  }

  useEffect(() => () => cancelHold.current(), [])

  const startHold = (): void => {
    if (holdTimer.current !== null) return
    setHolding(true)
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      setHolding(false)
      onDelete(session.id)
    }, HOLD_CONFIRM_MS)
  }

  return (
    <div className="session-row flex-col" role="listitem">
      {/* Row header: expand/collapse inspection panel (replaces the old
          click-to-load — loading is now an explicit "Replace Queue" action). */}
      <button
        type="button"
        className="flex w-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-left outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
        onClick={() => onToggleExpand(session.id)}
        aria-expanded={expanded}
        title={expanded ? 'Hide session tracks' : 'Show session tracks'}
      >
        <svg
          className={cn('size-3 shrink-0 text-faint transition-transform duration-200', expanded && 'rotate-90')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="meta flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <span className="truncate text-xs font-semibold text-ink" dir="auto">
            {session.name}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="numeric rounded-full border border-[#EAB308]/35 bg-[#EAB308]/10 px-1.5 text-[9px] font-semibold text-[#EAB308]">
              {session.trackCount} tracks
            </span>
            <span className="numeric font-mono text-[10px] tabular-nums text-faint" dir="ltr">
              {formatTime(session.durationSecs)}
            </span>
          </span>
        </span>
      </button>

      <button
        type="button"
        className={cn('hold-delete', holding && 'holding')}
        aria-label={`Hold to delete ${session.name}`}
        title="Hold 0.6s to delete"
        onPointerDown={(e) => {
          e.stopPropagation()
          startHold()
        }}
        onPointerUp={cancelHold.current}
        onPointerLeave={cancelHold.current}
        onPointerCancel={cancelHold.current}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            startHold()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') cancelHold.current()
        }}
        onClick={(e) => {
          // A quick tap must never delete NOR toggle the row's expand state.
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <Trash2 size={13} aria-hidden />
      </button>

      {/* Inline inspection panel — pure-CSS grid-rows accordion. */}
      <div className="session-accordion w-full" data-open={expanded}>
        <div>
          <div className="border-t border-[#2E3648]/60 pt-2">
            {tracks === null ? (
              <p className="px-1 py-1.5 text-[11px] text-faint">Loading tracks…</p>
            ) : tracks.length === 0 ? (
              <p className="px-1 py-1.5 text-[11px] text-faint">No readable tracks in this session.</p>
            ) : (
              <>
                {/* px-1 gutter: hover/active row fills never touch the scroll
                    container's edge, so nothing bleeds past the card boundary. */}
                <ul className="nocturne-scroll flex max-h-40 flex-col gap-0.5 overflow-y-auto px-1">
                {tracks.map((t, i) => {
                  const isPlaying = t.id === playingTrackId
                  return (
                    <li key={`${t.id}-${i}`}>
                      <button
                        type="button"
                        onClick={() => onPlayTrack(t)}
                        title={`Play “${t.title}”`}
                        className={cn(
                          'flex w-full box-border cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left',
                          // Kill the default focus ring entirely — including the
                          // bright oval Chromium paints on pointer focus — and
                          // keep the only ring for keyboard navigation.
                          'outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0',
                          'transition-all duration-150 hover:bg-[#1A1E27] active:scale-[0.99]',
                          'focus-visible:ring-1 focus-visible:ring-[#EAB308]/40'
                        )}
                      >
                        <span
                          className={cn(
                            'numeric w-4 shrink-0 text-right text-[10px]',
                            isPlaying ? 'font-semibold text-[#EAB308]' : 'text-faint'
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              'truncate text-xs font-medium',
                              isPlaying ? 'text-[#EAB308]' : 'text-[#F2F3F5]'
                            )}
                            dir="auto"
                          >
                            {t.title}
                          </span>
                          {t.artist ? (
                            <span className="truncate text-[11px] leading-tight text-[#A8B0BE]" dir="auto">
                              {t.artist}
                            </span>
                          ) : null}
                        </span>
                        {isPlaying && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-[#EAB308]"
                            aria-label="Now playing"
                          />
                        )}
                        <span className="numeric shrink-0 font-mono text-[11px] text-[#6B7484]" dir="ltr">
                          {formatTime(t.duration_secs)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              </>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onReplace(session)}
                disabled={tracks === null || tracks.length === 0}
                title="Replace the current queue with this session"
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#EAB308] px-2.5 py-1.5 text-xs font-semibold text-black',
                  'transition-colors hover:bg-[#EAB308]/90',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/60',
                  'disabled:pointer-events-none disabled:opacity-40'
                )}
              >
                <RotateCcw size={12} aria-hidden />
                <span>Replace Queue</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SessionRow
