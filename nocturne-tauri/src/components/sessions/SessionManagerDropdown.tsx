import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { ChevronDown, FolderDown, ListPlus } from 'lucide-react'
import {
  exportQueueSnapshot,
  playTrackFromSession,
  queueItemId,
  restoreCheckpoint,
  restorePreviousQueue,
  usePlayerStore,
  type PlayerTrack
} from '../../stores/usePlayerStore'
import { formatTime } from '../../types/player'
import { cn } from '../../lib/utils'
import { SessionRow, type SessionRowData } from './SessionRow'

interface SessionSummary {
  id: number
  name: string
  trackCount: number
  durationSecs: number
  createdAt: number
  updatedAt: number
}

/** Gap between the trigger button and the floating card. */
const ANCHOR_GAP = 8
/** Viewport margin the card must respect when being clamped. */
const VIEWPORT_MARGIN = 8
/** Must match the session-dropdown-out animation duration in index.css. */
const EXIT_MS = 140
/** Head start the exit fade gets before the heavy queue mutation runs. */
const EXIT_HEAD_START_MS = 80

/** Tracks without a readable path are unusable — mirrors restoreCheckpoint's filter. */
function parseSessionTracks(snapshotJson: string): PlayerTrack[] {
  try {
    const parsed = JSON.parse(snapshotJson) as { tracks?: PlayerTrack[] }
    return Array.isArray(parsed.tracks)
      ? parsed.tracks.filter((t) => t && typeof t.path === 'string' && t.path.length > 0)
      : []
  } catch {
    return []
  }
}

/**
 * SessionManagerDropdown — trigger button (queue utility strip) + anchored
 * portal popover for saving the current queue as a named session and
 * loading/appending/deleting existing ones.
 *
 * Selective saving: a collapsible checkbox list lets the user save a SUBSET of
 * the queue (unchecked tracks are excluded from the snapshot). Session rows
 * expand inline (lazy get_named_session fetch) to inspect the saved tracks
 * and choose Replace Queue (restoreCheckpoint); clicking an individual track
 * plays it immediately (playTrackFromSession — in-queue switch or append+play)
 * while the popover stays open and the queue list glides to the playing row.
 *
 * The list refetches on every open, save and delete; the heavy snapshot
 * payloads are pulled one-at-a-time via get_named_session only for the
 * session actually being expanded or loaded.
 *
 * The open card is rendered through a portal into document.body with
 * position: fixed. Every island (.island-queue included) clips positioned
 * descendants via overflow: hidden, so the card must live outside that DOM
 * subtree to stay fully visible; its coordinates are measured from the
 * trigger button's bounding rect on open and on window resize.
 */
export function SessionManagerDropdown(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // --- Selective save picker state ---------------------------------------
  // Direct selection: only explicitly CHECKED queue-row ids live in the set,
  // so the badge and the saved payload can never drift from what the user
  // sees. Re-seeded to "all selected" whenever the dropdown or picker opens.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // --- Session inspection state -------------------------------------------
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sessionTracks, setSessionTracks] = useState<Record<number, PlayerTrack[] | null>>({})

  // --- Exit transition state ----------------------------------------------
  // The card stays mounted for EXIT_MS with [data-leaving] applied so the
  // compositor-only fade can play before React unmounts it.
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<number | null>(null)

  const queue = usePlayerStore((s) => s.queue)
  const prevSnapshot = usePlayerStore((s) => s.previousQueueSnapshot)
  // Ref mirror so the open-effect can seed the selection from the live queue
  // without re-running (and wiping user progress) on every queue mutation.
  const queueRef = useRef(queue)
  useEffect(() => {
    queueRef.current = queue
  })
  const selectedCount = selectedIds.size
  const selectedTracks = queue.filter((t) => selectedIds.has(queueItemId(t)))

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setSessions(await invoke<SessionSummary[]>('list_saved_sessions'))
    } catch (err) {
      console.debug('[Sessions] list_saved_sessions failed:', err)
      setSessions([])
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  /**
   * Collapse every internal panel. Called on EVERY close path (trigger
   * toggle, outside click, Escape, exit-animation completion) — never in an
   * open-effect — so the values are already clean before the card's next
   * first paint and the reopened popover can't flash its previous expanded
   * geometry before snapping shut.
   */
  const resetInternalState = useCallback((): void => {
    setPickerOpen(false)
    setExpandedId(null)
    setSessionTracks({})
    setSelectedIds(new Set())
  }, [])

  // Fresh slate on every open as a defensive belt: with close-time resets in
  // place these are no-ops, but they guarantee a clean mount even if a future
  // close path forgets to call resetInternalState. (selectedIds is re-seeded
  // from the live queue via the ref, not a render-time closure.)
  useEffect(() => {
    if (!open) return
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    setLeaving(false)
    setSelectedIds(new Set(queueRef.current.map(queueItemId)))
    setPickerOpen(false)
    setExpandedId(null)
    setSessionTracks({})
  }, [open])

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    },
    []
  )

  /** Start the 140ms exit fade; unmount + state reset land when it completes. */
  const beginExit = useCallback((): void => {
    if (leaveTimer.current !== null) return
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null
      // Reset AFTER the card has faded (not during it) so the accordion
      // collapse animation is never visible inside the fading card.
      resetInternalState()
      setOpen(false)
      setLeaving(false)
    }, EXIT_MS)
  }, [resetInternalState])

  // Measure the trigger and pin the fixed card to it. Layout effect so the
  // card never paints at (0,0) before the first position lands.
  const measure = useCallback((): void => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    setPos({
      top: rect.bottom + ANCHOR_GAP,
      right: window.innerWidth - rect.right
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])

  // Once the card's height is known, keep it inside the viewport: shift it up
  // if it would spill past the bottom edge, never above the top edge.
  useLayoutEffect(() => {
    if (!open || !pos) return
    const card = popoverRef.current
    if (!card) return
    const overflowBottom = pos.top + card.offsetHeight + VIEWPORT_MARGIN - window.innerHeight
    if (overflowBottom > 0) {
      const clamped = Math.max(VIEWPORT_MARGIN, pos.top - overflowBottom)
      if (clamped !== pos.top) setPos({ ...pos, top: clamped })
    }
  }, [open, pos, sessions, pickerOpen, expandedId])

  // Outside click + Escape close (same contract as the sleep timer popover).
  // Both the trigger and the portaled card count as "inside".
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      resetInternalState()
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        resetInternalState()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, resetInternalState])

  const toggleTrack = useCallback((key: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const save = useCallback(async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name first')
      return
    }
    if (selectedCount === 0) {
      setError('Select at least one track')
      return
    }
    // Full selection → whole-queue snapshot (identical payload to before);
    // partial selection → subset snapshot with a re-derived active index.
    const snap =
      selectedCount === queue.length
        ? exportQueueSnapshot()
        : exportQueueSnapshot(selectedTracks)
    if (snap.trackCount === 0) {
      setError('Queue is empty — nothing to save')
      return
    }
    try {
      await invoke('save_named_session', {
        name: trimmed,
        trackCount: snap.trackCount,
        durationSecs: snap.durationSecs,
        snapshotJson: snap.snapshotJson
      })
      setName('')
      setError(null)
      void refresh()
    } catch (err) {
      console.debug('[Sessions] save_named_session failed:', err)
      setError(String(err))
    }
  }, [name, selectedCount, selectedTracks, queue.length, refresh])

  // Replace Queue — close FIRST (exit fade starts on the compositor), then
  // run the heavy queue restoration after an 80ms head start so the main
  // thread re-render never stutters the dismissal.
  const replaceQueue = useCallback(
    (session: SessionRowData): void => {
      beginExit()
      void (async () => {
        try {
          const snapshotJson = await invoke<string | null>('get_named_session', { id: session.id })
          await new Promise((resolve) => window.setTimeout(resolve, EXIT_HEAD_START_MS))
          if (!snapshotJson) return
          await restoreCheckpoint(snapshotJson)
        } catch (err) {
          console.debug('[Sessions] get_named_session failed:', err)
        }
      })()
    },
    [beginExit]
  )

  // Lazy inspection: expand/collapse a row, fetching its track list once.
  const toggleExpand = useCallback(
    (id: number): void => {
      setExpandedId((prev) => (prev === id ? null : id))
      if (sessionTracks[id] !== undefined) return
      setSessionTracks((prev) => ({ ...prev, [id]: null }))
      void (async () => {
        try {
          const snapshotJson = await invoke<string | null>('get_named_session', { id })
          setSessionTracks((prev) => ({
            ...prev,
            [id]: snapshotJson ? parseSessionTracks(snapshotJson) : []
          }))
        } catch (err) {
          console.debug('[Sessions] get_named_session failed:', err)
          setSessionTracks((prev) => ({ ...prev, [id]: [] }))
        }
      })()
    },
    [sessionTracks]
  )

  // Play one session track from inside the popover: the store switches to the
  // track's queue row (or appends it first), then we glide the background
  // QueuePanel list to the playing row. The popover itself is NEVER closed —
  // no close/dismiss handlers are touched here — so the queue shift stays
  // visible under the open card.
  const playSessionTrack = useCallback((track: PlayerTrack): void => {
    const rowKey = playTrackFromSession(track)
    if (!rowKey) return
    // React must commit the (possibly just-appended) queue row before the DOM
    // query can find it; a few short retries cover slower commits.
    const scrollToRow = (attempts: number): void => {
      window.setTimeout(() => {
        const row = document.querySelector<HTMLElement>(`[data-track-id="${CSS.escape(rowKey)}"]`)
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else if (attempts > 0) {
          scrollToRow(attempts - 1)
        }
      }, 60)
    }
    scrollToRow(5)
  }, [])

  const deleteSession = useCallback(
    async (id: number): Promise<void> => {
      try {
        await invoke('delete_named_session', { id })
      } catch (err) {
        console.debug('[Sessions] delete_named_session failed:', err)
      }
      void refresh()
    },
    [refresh]
  )

  const saveDisabled = name.trim().length === 0 || selectedCount === 0 || queue.length === 0

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // stopPropagation on BOTH phases: while open, the document-level
        // outside-click listener must never see this button's pointer/click
        // events — otherwise a rapid close→reopen sequence could have the
        // freshly-attached listener react to the very interaction that opened
        // the card and instantly dismiss it (the "flash" glitch). The button's
        // own onClick is the sole toggle authority.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (open) {
            resetInternalState()
            setOpen(false)
          } else {
            setOpen(true)
          }
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Saved sessions"
        title="Saved sessions"
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors duration-150',
          'hover:bg-white/10 hover:text-ink',
          'outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 focus-visible:ring-offset-0',
          open && 'bg-white/10 text-ink'
        )}
      >
        <FolderDown size={14} aria-hidden />
      </button>

      {/* Portal target is document.body: escapes every island's overflow:hidden.
          z-[80] sits above the islands (40) and the undo toast (60), below the
          command palette backdrop (100). */}
      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Saved sessions"
            data-leaving={leaving}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos.top, right: pos.right }}
            className={cn(
              'session-popover-in fixed z-[80] flex max-h-[calc(100vh-120px)] w-72 flex-col',
              'rounded-2xl border border-[#2E3648] bg-[#121419]/[0.98] p-4',
              'shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl',
              // Amber accent hairline along the top edge.
              "before:absolute before:inset-x-4 before:top-0 before:h-px before:content-['']",
              'before:bg-gradient-to-r before:from-transparent before:via-[#EAB308]/40 before:to-transparent'
            )}
          >
            {/* Header card — inline save flow (fixed above the scroll area). */}
            <div className="shrink-0">
              <label
                htmlFor="session-name-input"
                className="text-[11px] font-medium uppercase tracking-wider text-[#A8B0BE]"
              >
                Save current queue
              </label>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  id="session-name-input"
                  type="text"
                  dir="auto"
                  autoComplete="off"
                  maxLength={80}
                  placeholder="Session name…"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save()
                  }}
                  className={cn(
                    'h-8 w-full min-w-0 rounded-lg border bg-[#0A0B0E] px-2.5 text-xs text-[#F2F3F5]',
                    'placeholder:text-faint outline-none',
                    'focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
                    error ? 'border-[#EAB308]/70' : 'border-[#232936] focus:border-[#EAB308]/50'
                  )}
                />
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saveDisabled}
                  title={
                    queue.length === 0
                      ? 'Queue is empty'
                      : selectedCount === 0
                        ? 'No tracks selected'
                        : 'Save session'
                  }
                  className={cn(
                    'shrink-0 rounded-lg bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-black',
                    'transition-colors hover:bg-[#EAB308]/90',
                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/60',
                    'disabled:pointer-events-none disabled:opacity-40'
                  )}
                >
                  Save
                </button>
              </div>
              {error && (
                <p className="mt-1.5 text-[10px] text-[#EAB308]" role="alert">
                  {error}
                </p>
              )}

              {/* Selective track picker — collapsed by default. */}
              {queue.length > 0 && (
                <div className="mt-3 border-t border-[#232936]/60 pt-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerOpen((o) => !o)}
                      aria-expanded={pickerOpen}
                      className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium uppercase tracking-wider text-[#A8B0BE] transition-colors hover:text-ink focus:outline-none"
                    >
                      <ChevronDown
                        size={12}
                        className={cn('transition-transform duration-200', pickerOpen && 'rotate-180')}
                        aria-hidden
                      />
                      <span>
                        Select tracks ({selectedIds.size} of {queue.length})
                      </span>
                    </button>
                    {pickerOpen && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set(queue.map(queueItemId)))}
                          className="cursor-pointer rounded-md border border-[#2E3648] bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-[#A8B0BE] transition-colors hover:border-[#EAB308]/40 hover:text-ink focus:outline-none"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set())}
                          className="cursor-pointer rounded-md border border-[#2E3648] bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-[#A8B0BE] transition-colors hover:border-[#EAB308]/40 hover:text-ink focus:outline-none"
                        >
                          None
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pure-CSS grid-rows accordion around the scrollable list. */}
                  <div className="session-accordion" data-open={pickerOpen}>
                    <div>
                      <ul className="nocturne-scroll mt-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto pr-0.5">
                        {queue.map((t, i) => {
                          const key = queueItemId(t)
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/5">
                                <input
                                  type="checkbox"
                                  className="size-3.5 shrink-0 cursor-pointer accent-[#EAB308]"
                                  checked={selectedIds.has(key)}
                                  onChange={() => toggleTrack(key)}
                                  aria-label={`Include ${t.title}`}
                                />
                                <span className="numeric w-4 shrink-0 text-right text-[10px] text-faint">
                                  {i + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-xs text-[#F2F3F5]" dir="auto">
                                  {t.title}
                                </span>
                                <span className="numeric shrink-0 text-[10px] tabular-nums text-faint" dir="ltr">
                                  {formatTime(t.duration_secs)}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Replace-Queue undo banner: visible while a displaced queue can
                still be restored. Fixed between the save card and the list so
                it can never scroll away. */}
            {prevSnapshot && (
              <div className="mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/[0.07] px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-[#A8B0BE]" dir="auto">
                  Replaced active queue ({prevSnapshot.tracks.length}{' '}
                  {prevSnapshot.tracks.length === 1 ? 'track' : 'tracks'})
                </span>
                <button
                  type="button"
                  onClick={restorePreviousQueue}
                  title="Restore the queue that was replaced"
                  className={cn(
                    'shrink-0 cursor-pointer rounded-lg bg-[#EAB308] px-2.5 py-1 text-[11px] font-semibold text-black',
                    'outline-none transition-colors hover:bg-[#EAB308]/90',
                    'focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/60'
                  )}
                >
                  Undo
                </button>
              </div>
            )}

            {/* Session list — the card's scrollable flex child: when the save
                card, picker and expanded rows together exceed the card's
                max-height, only this section scrolls (the save card stays
                pinned) and nothing can spill past the window bottom. */}
            {sessions.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-1.5 border-t border-[#232936]/60 px-2 pb-2 pt-4 text-center">
                <ListPlus size={18} className="text-faint" aria-hidden />
                <p className="text-xs font-medium text-[#A8B0BE]">No saved sessions yet</p>
                <p className="text-[11px] text-faint">Save the current queue to revisit it later.</p>
              </div>
            ) : (
              <div className="nocturne-scroll mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-[#232936]/60 pt-3">
                <ul className="flex flex-col gap-1.5 px-0.5 py-1" role="list">
                  {sessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      expanded={expandedId === s.id}
                      tracks={sessionTracks[s.id] ?? null}
                      onToggleExpand={toggleExpand}
                      onReplace={(session) => void replaceQueue(session)}
                      onPlayTrack={playSessionTrack}
                      onDelete={(id) => void deleteSession(id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  )
}

export default SessionManagerDropdown
