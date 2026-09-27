import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Disc3, Dot, GripVertical, History as HistoryIcon, ListMusic, ListOrdered, Trash2, X, Zap } from 'lucide-react'
import {
  next,
  playNext,
  playTrackAt,
  queueItemId,
  removeFromPriorityQueue,
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
import { QueueTabs } from './queue/QueueTabs'
import { UndoToast } from './queue/UndoToast'
import { useQueueUndo, type QueueSnapshot } from './queue/useQueueUndo'
import { usePlaybackHistory, type HistoryEntry } from './queue/usePlaybackHistory'
import { captureFlipRects, playFlip, type FlipRects } from './queue/flipList'
import './queue/queue-styles.css'

/** Mirrors the toast exit transition so the ghost unmounts exactly with it (320ms). */
const TOAST_EXIT_MS = 320

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

/** "just now" / "2m ago" / "1h ago" / "3d ago" — Latin digits, LTR. */
function relativeTime(playedAt: number, now: number): string {
  const seconds = Math.floor(Math.max(0, now - playedAt) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function EmptyState({ icon, text, hint }: { icon: React.ReactNode; text: string; hint?: string }): JSX.Element {
  return (
    <div className="nq-empty">
      <span className="nq-empty-badge">{icon}</span>
      <p className="font-medium">{text}</p>
      {hint && <p className="text-[11px] opacity-70">{hint}</p>}
    </div>
  )
}

export interface QueuePanelProps {
  onClose?: () => void
  className?: string
  /** Right-click hook for the shared floating glass track context menu. */
  onTrackContextMenu?: (track: PlayerTrack, e: React.MouseEvent) => void
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
export function QueuePanel({ onClose, className, onTrackContextMenu }: QueuePanelProps): JSX.Element {
  const queue = usePlayerStore((s) => s.queue)
  const priorityQueue = usePlayerStore((s) => s.priorityQueue)
  const currentIndex = usePlayerStore((s) => s.index)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const activeTab = useUIStore((s) => s.rightTab)
  const setActiveTab = useUIStore((s) => s.setRightTab)

  const { history, clearHistory, getTrack } = usePlaybackHistory((s) => s)

  const flipContainerRef = useRef<HTMLUListElement | null>(null)
  const firstRectsRef = useRef<FlipRects | null>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  const prevSnapshotRef = useRef<QueueSnapshot | null>(null)

  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [settling, setSettling] = useState<{ id: string; fromY: number; active: boolean } | null>(null)
  const [ghostSnapshot, setGhostSnapshot] = useState<QueueSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())

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

  const { snapshot, beginReorder, undo, dismiss, windowMs } = useQueueUndo(restoreOrder)

  // INVERT + PLAY: runs after React commits the new DOM order, before paint.
  useLayoutEffect(() => {
    const first = firstRectsRef.current
    if (!first) return
    firstRectsRef.current = null
    playFlip(flipContainerRef.current, first)
  }, [queue])

  // Keep the toast mounted through its 320ms exit whenever the snapshot clears
  // (timeout, Undo, Escape) so it always dissolves instead of popping out.
  // The exit timer lives on a ref (not an effect cleanup): React re-runs this
  // effect when ghostSnapshot flips, and a cleanup would cancel the very timer
  // that unmounts the ghost, leaving an invisible toast over the list.
  useEffect(() => {
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

  // Relative timestamps tick while the History tab is visible.
  useEffect(() => {
    if (activeTab !== 'history') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [activeTab])

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
      beginReorder(order, 'Reordered')
      order.splice(from, 1)
      order.splice(to, 0, id)
      captureFlip()
      setQueueOrder(order)
    },
    [queue, beginReorder, captureFlip]
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

  const historyItems = useMemo(() => {
    const items: { entry: HistoryEntry; track: PlayerTrack }[] = []
    history.forEach((entry) => {
      const track = queue.find((t) => String(t.id) === entry.id) ?? getTrack(entry.id)
      if (track) items.push({ entry, track })
    })
    return items
  }, [history, queue, getTrack])

  /**
   * Replay from History: jump to the track when it is still in the context
   * playlist, otherwise push it to the top of the priority tier and step into
   * it. The context queue is NEVER spliced, so the album stays intact.
   */
  const playHistoryTrack = useCallback(
    (id: string): void => {
      const queuedAt = queue.findIndex((t) => String(t.id) === id)
      if (queuedAt >= 0) {
        void playTrackAt(queuedAt)
        return
      }
      const track = getTrack(id)
      if (!track) return
      playNext(track)
      void next()
    },
    [queue, getTrack]
  )

  const toastSnapshot = snapshot ?? ghostSnapshot

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden select-none', className)}>
      {/* Sliding studio tab header (measured amber pill) + window controls clearance */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 pl-3',
          onClose ? 'pr-3' : 'pr-[116px]'
        )}
      >
        <QueueTabs
          active={activeTab}
          onChange={setActiveTab}
          queueCount={queue.length}
          historyCount={history.length}
          className="min-w-0 flex-1"
        />

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
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Tab 1 — Queue: pointer events reorder + FLIP glide + click-to-play */}
        {activeTab === 'queue' && (
          <div
            ref={scrollContainerRef}
            role="tabpanel"
            id="panel-queue"
            aria-labelledby="tab-queue"
            data-dragging={dragState !== null}
            className="nocturne-scroll nq-list min-h-0 flex-1 overflow-y-auto p-2"
          >
            {queue.length === 0 && priorityQueue.length === 0 ? (
              <EmptyState
                icon={<ListMusic size={20} aria-hidden />}
                text="Queue is empty"
                hint="Add tracks from the library to queue them."
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
                      data-dragging={isDragging}
                      data-settling={isSettling}
                      data-drop-target={isDropTarget}
                      className={cn(
                        'nq-item relative overflow-visible transition-all duration-150',
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
                          'nq-row rounded-xl',
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
                              beginReorder(currentOrder, 'Reordered')

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
        )}

        {/* Tab 2 — History: last 50 played tracks, click to replay */}
        {activeTab === 'history' && (
          <div
            role="tabpanel"
            id="panel-history"
            aria-labelledby="tab-history"
            className="nocturne-scroll nq-list min-h-0 flex-1 overflow-y-auto p-2"
          >
            {historyItems.length > 0 && (
              <div className="nq-header-actions">
                <button type="button" className="nq-clear" onClick={clearHistory}>
                  <Trash2 size={13} aria-hidden />
                  <span>Clear History</span>
                </button>
              </div>
            )}

            {historyItems.length === 0 ? (
              <EmptyState
                icon={<HistoryIcon size={20} aria-hidden />}
                text="Nothing played yet"
                hint="Tracks you play show up here."
              />
            ) : (
              <ul className="nq-ul" aria-label="Recently played">
                {historyItems.map(({ entry, track }) => {
                  const t = track
                  const coverSrc = resolveCoverUrl(t.coverUrl) ?? t.coverUrl
                  return (
                    <li key={`${entry.id}-${entry.playedAt}`}>
                      <button type="button" className="nq-row" onClick={() => playHistoryTrack(entry.id)}>
                        <span className="idx">
                          <HistoryIcon size={13} aria-hidden />
                        </span>
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
                        <span className="time numeric">{relativeTime(entry.playedAt, now)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Tab 3 — Specs: technical audio inspector (unchanged) */}
        {activeTab === 'specs' && (
          <div
            role="tabpanel"
            id="panel-specs"
            aria-labelledby="tab-specs"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <AudioSpecsView />
          </div>
        )}

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
