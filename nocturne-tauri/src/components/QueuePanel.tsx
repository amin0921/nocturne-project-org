import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Disc3, Dot, GripVertical, ListMusic, ListOrdered, Trash2, X, Zap } from 'lucide-react'
import {
  clearQueueWithUndo,
  playTrackAt,
  queueItemId,
  removeFromPriorityQueue,
  removeQueuedRow,
  restoreQueueSnapshot,
  setQueueOrder,
  usePlayerStore,
  type PlayerTrack
} from '../stores/usePlayerStore'
import { useUIStore } from '../stores/useUIStore'
import { resolveCoverUrl } from '../utils/cover-url'
import { cn } from '../lib/utils'
import { formatTime, type Track } from '../types/player'
import { EqBars } from './EqBars'
import { AudioSpecsView } from './AudioSpecsView'
import { EmptyState } from './empty/EmptyState'
import { QueueTabs } from './queue/QueueTabs'
import { UndoToast } from './queue/UndoToast'
import { useQueueUndo, type QueueSnapshot } from './queue/useQueueUndo'
import { HistoryPanel } from './history/HistoryPanel'
import { SessionManagerDropdown } from './sessions/SessionManagerDropdown'
import { captureFlipRects, playFlip, type FlipRects } from './queue/flipList'
import './queue/queue-styles.css'

/** Mirrors the toast exit transition so the ghost unmounts exactly with it (180ms). */
const TOAST_EXIT_MS = 180

/** Warm the browser cache for upcoming track covers so stage swap never flashes. */
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
  /** Right-click hook for the shared floating glass track context menu. */
  onTrackContextMenu?: (track: PlayerTrack, e: React.MouseEvent) => void
  /** Resolve a history row's canonical path to its full library track. */
  resolveTrack?: (path: string) => PlayerTrack | undefined
}

interface DragState {
  id: string
  startIndex: number
  currentIndex: number
  startY: number
  currentY: number
  /** scrollTop of the queue container when the drag began (auto-scroll compensation). */
  startScrollTop: number
  /** Live scrollTop delta since drag start — keeps the ghost pinned under the cursor. */
  scrollDelta: number
}

/**
 * QueuePanel — Right Island studio panel.
 *
 * Tabs (sliding amber pill): Queue (Pointer Events drag handle + FLIP glide + undo
 * safety net), History (last 50 played tracks, click to replay), Specs.
 * Every reorder captures a snapshot first, so Ctrl/Cmd+Z or the Undo toast
 * restores the previous order instantly while playback keeps running.
 */
export function QueuePanel({ onClose, className, onTrackContextMenu, resolveTrack }: QueuePanelProps): JSX.Element {
  const queue = usePlayerStore((s) => s.queue)
  const priorityQueue = usePlayerStore((s) => s.priorityQueue)
  const currentIndex = usePlayerStore((s) => s.index)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const activeTab = useUIStore((s) => s.rightTab)
  const setActiveTab = useUIStore((s) => s.setRightTab)

  /** SQLite-backed history row count, reported by HistoryPanel after each fetch. */
  const [historyCount, setHistoryCount] = useState(0)

  const flipContainerRef = useRef<HTMLUListElement | null>(null)
  const firstRectsRef = useRef<FlipRects | null>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  const prevSnapshotRef = useRef<QueueSnapshot | null>(null)

  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [settling, setSettling] = useState<{ id: string; fromY: number; active: boolean } | null>(null)
  const [ghostSnapshot, setGhostSnapshot] = useState<QueueSnapshot | null>(null)

  // ----- Edge proximity auto-scroll (pointer-capture drags never trigger native scroll) -----
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollRaf = useRef<number | null>(null)
  const autoScrollMotionRef = useRef<{ direction: -1 | 1; speed: number } | null>(null)

  const stopAutoScroll = (): void => {
    autoScrollMotionRef.current = null
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current)
      autoScrollRaf.current = null
    }
  }

  /** Recompute the drop target + scroll compensation from a live pointer position. */
  const updateDragTarget = (id: string, pointerY: number): void => {
    const state = dragStateRef.current
    if (!state || state.id !== id) return
    const list = flipContainerRef.current
    if (!list) return

    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-track-id]'))
    let targetIndex = state.startIndex

    for (let idx = 0; idx < rows.length; idx++) {
      if (idx === state.startIndex) continue
      const rect = rows[idx].getBoundingClientRect()
      const midY = rect.top + rect.height / 2

      if (idx < state.startIndex) {
        if (pointerY < midY) {
          targetIndex = idx
          break
        }
      } else {
        if (pointerY < midY) {
          targetIndex = idx - 1
          break
        }
        targetIndex = idx
      }
    }

    const container = scrollContainerRef.current
    const scrollDelta = container ? container.scrollTop - state.startScrollTop : 0
    const next: DragState = { ...state, currentY: pointerY, currentIndex: targetIndex, scrollDelta }
    dragStateRef.current = next
    setDragState(next)
  }

  const startAutoScroll = (direction: -1 | 1, speed: number): void => {
    autoScrollMotionRef.current = { direction, speed }
    if (autoScrollRaf.current !== null) return
    const step = (): void => {
      const el = scrollContainerRef.current
      const motion = autoScrollMotionRef.current
      const state = dragStateRef.current
      if (!el || !motion || !state) {
        stopAutoScroll()
        return
      }
      el.scrollTop += motion.direction * motion.speed
      updateDragTarget(state.id, state.currentY)
      autoScrollRaf.current = requestAnimationFrame(step)
    }
    autoScrollRaf.current = requestAnimationFrame(step)
  }

  /** 45px edge zones: speed scales with how deep the pointer penetrates the zone (2→12 px/frame). */
  const applyEdgeAutoScroll = (pointerY: number): void => {
    const container = scrollContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (pointerY < rect.top + 45) {
      startAutoScroll(-1, Math.max(2, Math.min(12, ((rect.top + 45) - pointerY) / 3)))
    } else if (pointerY > rect.bottom - 45) {
      startAutoScroll(1, Math.max(2, Math.min(12, (pointerY - (rect.bottom - 45)) / 3)))
    } else {
      stopAutoScroll()
    }
  }

  // Cancel any in-flight auto-scroll if the panel unmounts mid-drag
  useEffect(() => stopAutoScroll, [])

  // Warm the next 4 covers (priority tier first — it plays before the album).
  usePreloadCovers(useMemo(
    () => [...priorityQueue, ...queue.slice(Math.max(0, currentIndex + 1), currentIndex + 5)],
    [priorityQueue, queue, currentIndex]
  ))

  /**
   * Album label for the context section header. Falls back to "PLAYLIST" for
   * untagged folder queues so the header never renders an empty title.
   */
  const contextLabel = useMemo(() => {
    const album = currentTrack?.album || queue[currentIndex]?.album || queue[0]?.album || ''
    return album.trim() || 'PLAYLIST'
  }, [currentTrack?.album, queue, currentIndex])

  // Activate magnetic landing transition in the next paint frame
  useEffect(() => {
    if (!settling || settling.active) return
    const rafId = requestAnimationFrame(() => {
      setSettling((prev) => (prev ? { ...prev, active: true } : null))
    })
    return () => cancelAnimationFrame(rafId)
  }, [settling])

  // Finalize 280ms magnetic landing cleanly
  useEffect(() => {
    if (!settling?.active) return
    const timer = window.setTimeout(() => {
      setSettling(null)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [settling?.active])

  const ghostTimerRef = useRef<number | null>(null)
  const clearGhostTimer = useCallback(() => {
    if (ghostTimerRef.current !== null) {
      window.clearTimeout(ghostTimerRef.current)
      ghostTimerRef.current = null
    }
  }, [])

  const captureFlip = useCallback((excludeKey?: string) => {
    firstRectsRef.current = captureFlipRects(flipContainerRef.current, excludeKey)
  }, [])

  const restoreOrder = useCallback(
    (order: string[]) => {
      captureFlip()
      setQueueOrder(order)
    },
    [captureFlip]
  )

  const { snapshot, begin, undo, dismiss, windowMs } = useQueueUndo()

  /** Undoable removal of one context row: snapshot → mutate → toast. */
  const removeRow = useCallback(
    (queueId: string): void => {
      const snap = removeQueuedRow(queueId)
      if (!snap) return
      begin({ label: 'Removed track from queue', restore: () => restoreQueueSnapshot(snap) })
    },
    [begin]
  )

  /** Undoable full clear (both tiers): snapshot → wipe → toast. */
  const clearQueueUndoable = useCallback((): void => {
    const snap = clearQueueWithUndo()
    if (!snap) return
    const count = snap.tracks.length + snap.priorityQueue.length
    begin({
      label: count === 1 ? 'Cleared queue (1 track)' : `Cleared queue (${count} tracks)`,
      restore: () => restoreQueueSnapshot(snap)
    })
  }, [begin])

  // INVERT + PLAY: runs after React commits the new DOM order, before paint.
  useLayoutEffect(() => {
    const first = firstRectsRef.current
    if (!first) return
    firstRectsRef.current = null
    playFlip(flipContainerRef.current, first)
  }, [queue])

  // Keep the toast mounted through its 180ms exit whenever the snapshot clears
  // (timeout, Undo, Escape) so it always dissolves instead of popping out.
  //
  // This MUST be a layout effect: the toast render guard is
  // `snapshot ?? ghostSnapshot`, so the commit that clears the snapshot would
  // otherwise paint one frame with NO toast before the ghost effect ran
  // (useEffect runs after paint) — the exact vanish-then-reappear flash on
  // Undo. A layout effect re-adds the ghost before the browser paints, so the
  // toast node stays in the DOM continuously and only the `nq-toast-out`
  // class flips.
  //
  // The exit timer lives on a ref (not an effect cleanup): React re-runs this
  // effect when ghostSnapshot flips, and a cleanup would cancel the very timer
  // that unmounts the ghost, leaving an invisible toast over the list.
  useLayoutEffect(() => {
    const prev = prevSnapshotRef.current
    prevSnapshotRef.current = snapshot
    if (snapshot) {
      clearGhostTimer()
      if (ghostSnapshot !== null) setGhostSnapshot(null)
      return
    }
    if (!prev || ghostSnapshot !== null) return
    setGhostSnapshot(prev)
    ghostTimerRef.current = window.setTimeout(() => {
      ghostTimerRef.current = null
      setGhostSnapshot(null)
    }, TOAST_EXIT_MS)
  }, [snapshot, ghostSnapshot, clearGhostTimer])

  useEffect(() => clearGhostTimer, [clearGhostTimer])

  // Follow the playhead: whenever `index` changes, glide the active row into
  // view inside the (very tall) full-playlist scroller.
  useEffect(() => {
    if (activeTab === 'queue' && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentIndex, currentTrack?.id, activeTab])

  // Escape key cancels active pointer drag with smooth return
  useEffect(() => {
    if (!dragState) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const state = dragStateRef.current
        if (state) {
          const fromY = state.currentY - state.startY + state.scrollDelta
          setSettling({ id: state.id, fromY, active: false })
        }
        stopAutoScroll()
        dragStateRef.current = null
        setDragState(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dragState])

  /**
   * Alt+ArrowUp / Alt+ArrowDown keyboard reorder (same snapshot + FLIP path).
   * Indices are absolute playlist positions over the FULL, never-truncated
   * context list.
   */
  const moveTrack = useCallback(
    (id: string, delta: number): void => {
      const order = queue.map(queueItemId)
      const from = order.indexOf(id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= order.length) return
      begin({ label: 'Reordered', restore: () => restoreOrder(order) })
      const newOrder = [...order]
      newOrder.splice(from, 1)
      newOrder.splice(to, 0, id)
      captureFlip()
      setQueueOrder(newOrder)
    },
    [queue, begin, captureFlip, restoreOrder]
  )

  const onRowKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string): void => {
      if (!e.altKey) return
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      e.stopPropagation()
      moveTrack(id, e.key === 'ArrowUp' ? -1 : 1)
    },
    [moveTrack]
  )

  const toastSnapshot = snapshot ?? ghostSnapshot

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden select-none', className)}>
      {/* Tab strip header — tabs ONLY. The floating window-controls pill
          (App.tsx: ~106px wide at top-3 right-4, z-[60]) overlays this island's
          top-right corner, so pr-[116px] keeps the nowrap tab strip clear of it.
          No utility buttons live on this row: measured tabs are ~183px wide, and
          with a trigger button added the flex overflow pushed that group under
          the pill on 280px islands. */}
      <div className="flex h-14 shrink-0 items-center border-b border-white/10 pl-3 pr-[116px]">
        <QueueTabs
          active={activeTab}
          onChange={setActiveTab}
          queueCount={queue.length}
          historyCount={historyCount}
          className="shrink-0"
        />
      </div>

      {/* Utility strip — saved-sessions trigger (+ sheet close control) on its
          own row BELOW the window-controls pill's vertical band (the pill spans
          roughly y=12..50 in the shell; this row starts at y≈72), so overlap is
          impossible by construction regardless of island width. */}
      <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-white/5 px-2">
        {activeTab === 'queue' && (queue.length > 0 || priorityQueue.length > 0) && (
          <button
            type="button"
            onClick={clearQueueUndoable}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-faint transition-colors hover:bg-white/10 hover:text-ink focus-visible:outline-none"
            aria-label="Clear queue"
          >
            <Trash2 size={13} aria-hidden />
            <span>Clear Queue</span>
          </button>
        )}
        <SessionManagerDropdown />
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

      {/*
        Main Tab View Container.

        PERSISTENT PANES: all three views stay mounted and hydrated forever and
        are toggled with `display: none` alone. React used to destroy the
        inactive tree, so every switch back to `queue` synchronously remounted
        127+ heavy rows (covers, SVG, drag handlers, context-menu listeners) in
        one frame and froze the main thread. A pure CSS repaint is now the whole
        cost, and each pane keeps its own scrollTop for free.
      */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Tab 1 — Queue: pointer events reorder + FLIP glide + click-to-play */}
        <div
          ref={scrollContainerRef}
          role="tabpanel"
          id="panel-queue"
          aria-labelledby="tab-queue"
          aria-hidden={activeTab !== 'queue'}
          data-dragging={dragState !== null}
          className={cn(
            'nocturne-scroll nq-list nq-pane-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2',
            activeTab === 'queue' ? 'block' : 'hidden'
          )}
        >
            {queue.length === 0 && priorityQueue.length === 0 ? (
              <EmptyState
                icon={<ListMusic size={20} aria-hidden />}
                title="Queue is empty"
                description="Add tracks from your library or stage to start listening"
              />
            ) : (
              <>
                {/* ── NOW PLAYING ─────────────────────────────────────────── */}
                {currentTrack && (
                  <div className="nq-nowplaying" data-current="true">
                    <span className="nq-nowplaying-tag">NOW PLAYING</span>
                    <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-amber-500/30 bg-white/5">
                      {(() => {
                        const src = resolveCoverUrl(currentTrack.coverUrl) ?? currentTrack.coverUrl
                        return src ? (
                          <img src={src} alt="" className="size-full object-cover" draggable={false} />
                        ) : (
                          <div className="grid size-full place-items-center text-white/30">
                            <Disc3 size={16} />
                          </div>
                        )
                      })()}
                    </div>
                    <span className="meta">
                      <span className="title" dir="auto">
                        {currentTrack.title}
                      </span>
                      <span className="sub" dir="auto">
                        {currentTrack.artist}
                      </span>
                    </span>
                    <EqBars isPlaying={isPlaying} />
                    <span className="time numeric">{formatTime(currentTrack.duration_secs)}</span>
                  </div>
                )}

                {/* ── TIER 1 — NEXT IN QUEUE (user priority, amber) ────────── */}
                {priorityQueue.length > 0 && (
                  <section className="nq-section" aria-label="Next in queue">
                    <header className="nq-section-head nq-section-head-priority">
                      <Zap size={11} aria-hidden />
                      <span>NEXT IN QUEUE</span>
                      <span className="nq-section-count">{priorityQueue.length}</span>
                    </header>
                    <ul className="nq-ul" data-priority="true">
                      {priorityQueue.map((t) => {
                        const key = queueItemId(t)
                        const coverSrc = resolveCoverUrl(t.coverUrl) ?? t.coverUrl
                        return (
                          <li key={key} className="nq-item" data-priority-row={key}>
                            <div
                              className="nq-row nq-row-priority"
                              role="listitem"
                              onContextMenu={(e) => {
                                if (!onTrackContextMenu) return
                                e.preventDefault()
                                onTrackContextMenu(t, e)
                              }}
                            >
                              <span className="idx" aria-hidden="true">
                                <Dot size={16} className="text-[#EAB308]" />
                              </span>
                              <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-amber-500/20 bg-white/5">
                                {coverSrc ? (
                                  <img src={coverSrc} alt="" className="size-full object-cover" draggable={false} />
                                ) : (
                                  <div className="grid size-full place-items-center text-white/30">
                                    <Disc3 size={16} />
                                  </div>
                                )}
                              </div>
                              <span className="meta">
                                <span className="title" dir="auto">
                                  {t.title}
                                </span>
                                <span className="sub" dir="auto">
                                  {t.artist}
                                </span>
                              </span>
                              <span className="time numeric">{formatTime(t.duration_secs)}</span>
                              <button
                                type="button"
                                className="nq-remove"
                                aria-label={`Remove ${t.title} from queue`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeFromPriorityQueue(key)
                                }}
                              >
                                <X size={12} aria-hidden />
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )}

                {/* Obsidian glass separator between the two tiers */}
                {priorityQueue.length > 0 && queue.length > 0 && <div className="nq-separator" aria-hidden="true" />}

                {/* ── TIER 2 — THE COMPLETE PLAYLIST CONTEXT (never truncated) ── */}
                {queue.length > 0 && (
                  <section className="nq-section" aria-label={`Playlist ${contextLabel}`}>
                    <header className="nq-section-head">
                      <ListOrdered size={11} aria-hidden />
                      <span>{contextLabel.toUpperCase()}</span>
                      <span className="nq-section-total">{queue.length} TRACKS</span>
                    </header>
                    <ul ref={flipContainerRef} className="nq-ul" aria-label="Playlist tracks">
                        {queue.map((track, index) => {
                  const t = track
                  const key = queueItemId(t)
                  const queueIndex = index
                  // The playhead row lives in the full list, so the highlight is
                  // index-driven. Matching on the id as well keeps a same-id row
                  // from the priority tier from lighting up the wrong song.
                  const isActive = queueIndex === currentIndex && currentTrack?.id === t.id
                  const coverSrc = resolveCoverUrl(t.coverUrl) ?? t.coverUrl
                  const isDragging = dragState?.id === key
                  const isSettling = settling?.id === key
                  const isDropTarget =
                    dragState !== null && dragState.currentIndex === index && dragState.id !== key

                  return (
                    <li
                      key={key}
                      data-flip={key}
                      data-track-id={key}
                      data-queue-id={t.queueId}
                      data-library-id={t.id}
                      data-dragging={isDragging}
                      data-settling={isSettling}
                      data-drop-target={isDropTarget}
                      className={cn(
                        // Colors-only: this row tracks the queue column width,
                        // so `transition-all` here interpolated its box during
                        // window maximize/restore (accordion crumple).
                        'nq-item relative overflow-visible transition-colors duration-150',
                        isDragging || isSettling ? 'z-[9999]' : 'z-[1]',
                        isDropTarget && 'rounded-xl bg-amber-500/[0.08] ring-1 ring-amber-500/30'
                      )}
                    >
                      {isDragging && (
                        <div
                          className="h-12 w-full rounded-xl border border-dashed border-white/10 bg-white/[0.02]"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        ref={isActive ? activeItemRef : undefined}
                        type="button"
                        className={cn(
                          'nq-row rounded-xl group',
                          isDragging &&
                            'absolute inset-x-0 top-0 z-[9999] rounded-xl overflow-hidden bg-[#161922] border border-amber-500/50 shadow-[0_20px_50px_rgba(0,0,0,0.85)] pointer-events-none select-none scale-[1.02]'
                        )}
                        style={
                          isDragging
                            ? {
                                transform: `translateY(${dragState.currentY - dragState.startY + dragState.scrollDelta}px)`
                              }
                            : isSettling
                            ? {
                                transform: settling.active
                                  ? 'translateY(0px)'
                                  : `translateY(${settling.fromY}px)`,
                                transition: settling.active
                                  ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
                                  : 'none',
                                willChange: 'transform'
                              }
                            : undefined
                        }
                        data-dragging={isDragging}
                        data-settling={isSettling}
                        data-current={isActive}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => {
                          if (dragState !== null || isSettling) return
                          void playTrackAt(queueIndex)
                        }}
                        onKeyDown={(e) => onRowKeyDown(e, key)}
                        onContextMenu={(e) => {
                          if (!onTrackContextMenu) return
                          e.preventDefault()
                          onTrackContextMenu(t, e)
                        }}
                      >
                        <span
                          className="drag pointer-events-auto"
                          aria-hidden="true"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            setSettling(null)
                            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                            const next: DragState = {
                              id: key,
                              startIndex: index,
                              currentIndex: index,
                              startY: e.clientY,
                              currentY: e.clientY,
                              startScrollTop: scrollContainerRef.current?.scrollTop ?? 0,
                              scrollDelta: 0
                            }
                            dragStateRef.current = next
                            setDragState(next)
                          }}
                          onPointerMove={(e) => {
                            const state = dragStateRef.current
                            if (!state || state.id !== key) return
                            const pointerY = e.clientY
                            applyEdgeAutoScroll(pointerY)
                            updateDragTarget(key, pointerY)
                          }}
                          onPointerUp={(e) => {
                            const state = dragStateRef.current
                            if (!state || state.id !== key) return
                            stopAutoScroll()
                            try {
                              ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                            } catch {}

                            const { startIndex, currentIndex, startY, scrollDelta } = state
                            const pointerY = e.clientY
                            const list = flipContainerRef.current
                            let fromY = pointerY - startY + scrollDelta
                            if (list) {
                              const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-track-id]'))
                              const startRow = rows[startIndex]
                              const targetRow = rows[currentIndex]
                              if (startRow && targetRow) {
                                const startTop = startRow.getBoundingClientRect().top
                                const targetTop = targetRow.getBoundingClientRect().top
                                fromY = (startTop + (pointerY - startY)) - targetTop + scrollDelta
                              }
                            }

                            const movedId = state.id
                            if (startIndex !== currentIndex) {
                              const currentOrder = queue.map(queueItemId)
                              begin({ label: 'Reordered', restore: () => restoreOrder(currentOrder) })

                              const newOrder = [...currentOrder]
                              newOrder.splice(startIndex, 1)
                              newOrder.splice(currentIndex, 0, movedId)

                              captureFlip(movedId)
                              setSettling({ id: movedId, fromY, active: false })
                              setQueueOrder(newOrder)
                            } else {
                              setSettling({ id: movedId, fromY, active: false })
                            }
                            dragStateRef.current = null
                            setDragState(null)
                          }}
                          onPointerCancel={(e) => {
                            stopAutoScroll()
                            try {
                              ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                            } catch {}
                            const state = dragStateRef.current
                            if (state) {
                              const fromY = state.currentY - state.startY + state.scrollDelta
                              setSettling({ id: state.id, fromY, active: false })
                            }
                            dragStateRef.current = null
                            setDragState(null)
                          }}
                        >
                          <GripVertical size={14} />
                        </span>
                        <span className="idx numeric">{String(queueIndex + 1).padStart(2, '0')}</span>
                        <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                          {coverSrc ? (
                            <img src={coverSrc} alt="" className="size-full object-cover" draggable={false} />
                          ) : (
                            <div className="grid size-full place-items-center text-white/30">
                              <Disc3 size={16} />
                            </div>
                          )}
                        </div>
                        <span className="meta">
                          <span className="title" dir="auto">
                            {t.title}
                          </span>
                          <span className="sub" dir="auto">
                            {t.artist}
                          </span>
                        </span>
                        {isActive && <EqBars isPlaying={isPlaying} />}
                        <span className="time numeric">{formatTime(t.duration_secs)}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${t.title} from queue`}
                          className="pointer-events-auto flex shrink-0 cursor-pointer rounded p-1 text-faint opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 focus-visible:text-red-400 group-hover:opacity-100 group-focus-within:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeRow(key)
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return
                            e.preventDefault()
                            e.stopPropagation()
                            removeRow(key)
                          }}
                        >
                          <Trash2 size={13} aria-hidden />
                        </span>
                      </button>
                    </li>
                  )
                })}
                    </ul>
                  </section>
                )}
              </>
            )}
        </div>

        {/* Tab 2 — History: SQLite-backed listening history (persistent pane) */}
        <div
          role="tabpanel"
          id="panel-history"
          aria-labelledby="tab-history"
          aria-hidden={activeTab !== 'history'}
          className={cn(
            'nocturne-scroll nq-list nq-pane-fade min-h-0 flex-1 overflow-y-auto p-2',
            activeTab === 'history' ? 'block' : 'hidden'
          )}
        >
          <HistoryPanel resolveTrack={resolveTrack} onEntriesChange={setHistoryCount} />
        </div>

        {/* Tab 3 — Specs: technical audio inspector (persistent) */}
        <div
          role="tabpanel"
          id="panel-specs"
          aria-labelledby="tab-specs"
          aria-hidden={activeTab !== 'specs'}
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            activeTab === 'specs' ? 'flex' : 'hidden'
          )}
        >
          <AudioSpecsView />
        </div>

        {/* Undo safety net — floats above the list while a snapshot is live */}
        {toastSnapshot && (
          <UndoToast
            key={toastSnapshot.at}
            message={toastSnapshot.label}
            windowMs={windowMs}
            leaving={snapshot === null}
            onUndo={undo}
            onDismiss={dismiss}
          />
        )}
      </div>
    </div>
  )
}

export default QueuePanel
