import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Disc3, Music } from 'lucide-react'
import {
  playTrackAt,
  reorderQueue,
  usePlayerStore,
  type PlayerTrack
} from '../../stores/usePlayerStore'
import { useUIStore } from '../../stores/useUIStore'
import { formatTime } from '../../types/player'
import { resolveCoverUrl } from '../../utils/cover-url'
import { cn } from '../../lib/utils'
import { EqBars } from '../EqBars'
import { useSpring, type SpringConfig } from '../../hooks/useSpring'

/**
 * MagneticQueue — hand-rolled "Magnetic Queue" (luxury micro-interactions §5).
 *
 * Zero external dnd libraries: Pointer Events + FLIP transforms + the shared
 * `useSpring` primitive. Phases: pending (6px threshold) → dragging (lift,
 * spring-weighted follow, sibling FLIP displacement, magnetic lean) →
 * settling (elastic snap with ~4px overshoot; commit + amber chip flash fire
 * only when the spring's physics settle — delta < 0.5px, velocity ≈ 0) or
 * cancelling (Escape / pointercancel — springs home, no order mutation).
 * `prefers-reduced-motion` snaps everything instantly.
 */

const DRAG_THRESHOLD_PX = 6
const MAGNETIC_LEAN_PX = 6
const MAGNETIC_PROXIMITY_PX = 18
const DRAG_SPRING: SpringConfig = { stiffness: 400, damping: 32 }
const DROP_SPRING: SpringConfig = { stiffness: 500, damping: 30 }
const CANCEL_SPRING: SpringConfig = { stiffness: 300, damping: 28 }
/** Physics settle gate — spring is "at rest" below these thresholds (no fixed timers). */
const SETTLE_DELTA_PX = 0.5
const SETTLE_VELOCITY_PX = 0.1
/** Studio Amber flash holds bright this long, then CSS-fades back to silver (300ms). */
const FLASH_HOLD_MS = 400

type DragPhase = 'pending' | 'dragging' | 'settling' | 'cancelling'

interface RowRect {
  top: number
  height: number
}

interface DragState {
  pointerId: number
  el: HTMLElement
  startIndex: number
  targetIndex: number
  startClientX: number
  startClientY: number
  /** Viewport rects of every row, measured once at pointerdown (order frozen during a gesture). */
  rects: RowRect[]
  /** Distance between consecutive row tops (row height + gap). */
  stride: number
  phase: DragPhase
  /** Final spring target (px) the settle monitor awaits rest against. */
  settleTarget: number
  /** Last spring value painted to the dragged row (settle monitor input). */
  lastValue: number
  /** Guards the settle monitor so commit/endGesture fire exactly once. */
  settleFired: boolean
  /** Captured at pointerup: track to amber-flash when the spring lands. */
  movedTrack: PlayerTrack | null
  /** Captured at pointerup: next queue order, committed atomically on settle. */
  nextOrder: PlayerTrack[] | null
}

/** Reset inline transitions on the next frame — safe once no transform values change. */
function restoreTransitions(els: HTMLElement[]): void {
  requestAnimationFrame(() => {
    els.forEach((el) => {
      if (el.isConnected) el.style.transition = ''
    })
  })
}

/**
 * Null-render spring driver. Remounting via `gen` resets the internal spring
 * value to 0 at the start of every gesture (useSpring has no external reset).
 */
function DragSpring({
  target,
  config,
  onValue
}: {
  target: number
  config: SpringConfig
  onValue: (value: number) => void
  gen: number
}): null {
  useSpring(target, onValue, config)
  return null
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

export function MagneticQueue(): JSX.Element {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.index)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const rightTab = useUIStore((s) => s.rightTab)

  const listRef = useRef<HTMLDivElement | null>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const frozenRef = useRef<PlayerTrack[] | null>(null)
  const flashTimerRef = useRef<number | null>(null)

  const [liftedIndex, setLiftedIndex] = useState<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const [springGen, setSpringGen] = useState(0)
  const [springConfig, setSpringConfig] = useState<SpringConfig>(DRAG_SPRING)
  const [frozen, setFrozen] = useState<PlayerTrack[] | null>(null)
  const [flashId, setFlashId] = useState<number | null>(null)

  const lifted = liftedIndex !== null
  const displayTracks = frozen ?? queue

  const applyFrozen = useCallback((value: PlayerTrack[] | null): void => {
    frozenRef.current = value
    setFrozen(value)
  }, [])

  const clearTimers = useCallback((ref: React.MutableRefObject<number | null>): void => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }, [])

  /** Spring writes go straight to the DOM — zero React re-renders per frame. */
  const paintDragged = useCallback((value: number) => {
    const d = dragRef.current
    if (!d) return
    d.lastValue = value
    d.el.style.transform = `translateY(${value}px)`
  }, [])

  /** Target slot from row midpoints + FLIP sibling shift + 6px magnetic lean. */
  const updateSlotTargets = useCallback((d: DragState, clientY: number): void => {
    const { rects, startIndex, el } = d
    if (rects.length === 0) return
    const center = rects[startIndex].top + rects[startIndex].height / 2 + (clientY - d.startClientY)

    let target = 0
    for (let i = 0; i < rects.length; i++) {
      if (center >= rects[i].top + rects[i].height / 2) target = i
    }
    d.targetIndex = target

    const list = listRef.current
    if (!list) return
    const children = Array.from(list.children) as HTMLElement[]
    const targetCenter = rects[target].top + rects[target].height / 2
    const inSlot = Math.abs(center - targetCenter) <= MAGNETIC_PROXIMITY_PX

    children.forEach((child, i) => {
      if (child === el || i >= rects.length) return
      let shift = 0
      if (startIndex < target && i > startIndex && i <= target) shift = -d.stride
      else if (startIndex > target && i >= target && i < startIndex) shift = d.stride
      let lean = 0
      if (inSlot && Math.abs(i - target) === 1) {
        const neighborCenter = rects[i].top + rects[i].height / 2
        lean = Math.sign(targetCenter - neighborCenter) * MAGNETIC_LEAN_PX
      }
      const total = shift + lean
      child.style.transform = total === 0 ? '' : `translateY(${total}px)`
    })
  }, [])

  /** End of gesture: unlock transforms, drop the lift, release any order freeze. */
  const endGesture = useCallback((): void => {
    dragRef.current = null
    const list = listRef.current
    const els = list ? (Array.from(list.children) as HTMLElement[]) : []
    // Exclude transform so the FLIP reset (or spring tail) never animates twice.
    // Strictly filter/box-shadow — never width, margin, or transform (horizontal lock).
    els.forEach((el) => {
      el.style.transition = 'filter 150ms, box-shadow 150ms'
    })
    const hadFrozen = frozenRef.current !== null
    if (!hadFrozen) {
      els.forEach((el) => {
        el.style.transform = ''
      })
      restoreTransitions(els)
    }
    // Frozen path: the layout effect clears transforms atomically with the
    // committed DOM reorder (after-new-order, before paint).
    setLiftedIndex(null)
    applyFrozen(null)
  }, [applyFrozen])

  /**
   * Physics settle completion — fires from the settle monitor the instant the
   * spring rests (delta < 0.5px, velocity ≈ 0), never from a fixed timeout:
   * a) atomic store commit (reorderQueue — audio/index untouched),
   * b) Studio Amber index flash (held bright FLASH_HOLD_MS, then CSS fade),
   * c) clean gesture reset (unfreeze + DOM-order sync pre-paint).
   */
  const completeSettle = useCallback((): void => {
    const d = dragRef.current
    if (!d) return
    if (d.nextOrder) reorderQueue(d.nextOrder)
    if (d.movedTrack) {
      setFlashId(d.movedTrack.id)
      clearTimers(flashTimerRef)
      flashTimerRef.current = window.setTimeout(() => setFlashId(null), FLASH_HOLD_MS)
    }
    endGesture()
  }, [clearTimers, endGesture])

  /**
   * Event-driven settle gate: polls the live spring value every frame and
   * completes only at true rest — long drops travel their full trajectory
   * before commit/flash/unfreeze (no LAND_FLASH_MS / 320ms desync possible).
   * Under reduced motion the spring snaps instantly, so this resolves on the
   * next frame too.
   */
  const startSettleMonitor = useCallback(
    (d: DragState): void => {
      let lastSeen = d.lastValue
      const check = (): void => {
        const cur = dragRef.current
        if (!cur || cur !== d || d.settleFired) return
        if (cur.phase !== 'settling' && cur.phase !== 'cancelling') return
        const v = d.lastValue
        const vel = Math.abs(v - lastSeen)
        lastSeen = v
        if (Math.abs(v - d.settleTarget) < SETTLE_DELTA_PX && vel < SETTLE_VELOCITY_PX) {
          d.settleFired = true
          if (cur.phase === 'settling') completeSettle()
          else endGesture()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    },
    [completeSettle, endGesture]
  )

  /** Escape / pointercancel: spring home, never mutate the stored order. */
  const cancelGesture = useCallback((): void => {
    const d = dragRef.current
    if (!d) return
    suppressClickRef.current = true
    if (d.phase === 'pending') {
      dragRef.current = null
      return
    }
    if (d.phase === 'settling' || d.phase === 'cancelling') return
    d.phase = 'cancelling'
    setSpringConfig(CANCEL_SPRING)
    setDragY(0)
    const list = listRef.current
    if (list) {
      const children = Array.from(list.children) as HTMLElement[]
      children.forEach((child) => {
        if (child !== d.el) child.style.transform = ''
      })
    }
    // Physics-driven unfreeze: the settle monitor ends the gesture when the
    // cancel spring rests — no fixed CANCEL_SPRING_MS timeout.
    d.settleTarget = 0
    d.settleFired = false
    startSettleMonitor(d)
  }, [startSettleMonitor])

  // Escape cancels an active gesture (spec §5 Cancel row).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancelGesture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelGesture])

  // Auto-scroll to the active track when currentIndex changes and the tab is visible.
  useEffect(() => {
    if (rightTab === 'queue' && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentIndex, rightTab])

  // After the order freeze releases, clear residual FLIP transforms exactly
  // when React has committed the new DOM order (pre-paint → no jump).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const els = Array.from(list.children) as HTMLElement[]
    if (frozen === null) {
      els.forEach((el) => {
        el.style.transform = ''
      })
      restoreTransitions(els)
    }
  }, [frozen])

  // Unmount mid-gesture: drop timers + the drag so no monitor fires against a dead list.
  useEffect(() => {
    return () => {
      dragRef.current = null
      clearTimers(flashTimerRef)
    }
  }, [clearTimers])

  const onRowPointerDown = (index: number, e: React.PointerEvent<HTMLButtonElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (dragRef.current) return
    const list = listRef.current
    if (!list) return
    const rows = Array.from(list.children) as HTMLElement[]
    if (rows.length === 0) return
    const rects: RowRect[] = rows.map((r) => {
      const b = r.getBoundingClientRect()
      return { top: b.top, height: b.height }
    })
    const stride =
      rows.length > 1 ? Math.max(1, rects[1].top - rects[0].top) : Math.max(1, rects[0].height)
    dragRef.current = {
      pointerId: e.pointerId,
      el: e.currentTarget,
      startIndex: index,
      targetIndex: index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      rects,
      stride,
      phase: 'pending',
      settleTarget: 0,
      lastValue: 0,
      settleFired: false,
      movedTrack: null,
      nextOrder: null
    }
    suppressClickRef.current = false
    // A fresh gesture cancels any in-flight amber flash.
    clearTimers(flashTimerRef)
    setFlashId(null)
    // Fresh spring instance per gesture (value resets to 0, no stale offset).
    setSpringGen((g) => g + 1)
    setSpringConfig(DRAG_SPRING)
    setDragY(0)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Capture is best-effort; capture-less drags still function on mouse.
    }
  }

  const onRowPointerMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return

    if (d.phase === 'pending') {
      const dx = e.clientX - d.startClientX
      const dy = e.clientY - d.startClientY
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      // Lift phase: 6px crossed → row lifts (Y-translation + shadow only — no
      // horizontal scale, so the row width never bulges or retracts).
      d.phase = 'dragging'
      suppressClickRef.current = true
      d.el.style.transition = 'filter 150ms, box-shadow 150ms'
      setLiftedIndex(d.startIndex)
      setDragY(dy)
      updateSlotTargets(d, e.clientY)
      return
    }
    if (d.phase !== 'dragging') return
    setDragY(e.clientY - d.startClientY)
    updateSlotTargets(d, e.clientY)
  }

  const commitDrag = (d: DragState): void => {
    d.phase = 'settling'
    const { startIndex, targetIndex, stride } = d
    const finalOffset = (targetIndex - startIndex) * stride

    // Elastic snap: 4px spring overshoot (stiffness 500 / damping 30).
    // The settle monitor — not a timer — decides when the flight has landed.
    d.settleTarget = finalOffset
    d.settleFired = false
    setSpringConfig(DROP_SPRING)
    setDragY(finalOffset)

    d.movedTrack = displayTracks[startIndex] ?? null

    if (targetIndex !== startIndex && startIndex < displayTracks.length) {
      const next = displayTracks.slice()
      const [item] = next.splice(startIndex, 1)
      next.splice(targetIndex, 0, item)
      // Freeze the visual order; the atomic store commit lands in
      // completeSettle() when the spring rests, so DOM reorder, chip numbers,
      // and the amber flash all fire together — zero mid-flight desync.
      applyFrozen(displayTracks)
      d.nextOrder = next
    } else {
      d.nextOrder = null
      if (listRef.current) {
        // No reorder: release the magnetic lean so siblings ease home.
        const children = Array.from(listRef.current.children) as HTMLElement[]
        children.forEach((child) => {
          if (child !== d.el) child.style.transform = ''
        })
      }
    }

    startSettleMonitor(d)
  }

  const onRowPointerUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    if (d.phase === 'pending') {
      dragRef.current = null
      return // plain click → onRowClick plays the track
    }
    if (d.phase === 'settling' || d.phase === 'cancelling') return
    commitDrag(d)
  }

  const onRowPointerCancel = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    cancelGesture()
  }

  const onRowClick = (displayIndex: number): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    // Mid-settle: the displayed order is still the pre-commit freeze — ignore.
    if (frozenRef.current !== null) return
    // playTrackAt no-ops when the target is already the playing track.
    void playTrackAt(displayIndex)
  }

  return (
    <>
      <DragSpring key={springGen} target={dragY} config={springConfig} onValue={paintDragged} gen={springGen} />

      <div
        ref={listRef}
        role="tabpanel"
        id="panel-queue"
        aria-labelledby="tab-queue"
        aria-label="Upcoming tracks"
        data-dragging={lifted ? 'true' : 'false'}
        className="nocturne-scroll mq-list min-h-0 flex-1 overflow-y-auto p-2 space-y-0.5"
      >
        {displayTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-surface/50 text-faint mb-3">
              <Music size={20} />
            </span>
            <p className="text-xs font-medium text-ink">Queue is empty</p>
            <p className="text-[11px] text-faint mt-1">Add tracks from the library to queue them.</p>
          </div>
        ) : (
          displayTracks.map((track, i) => {
            const isActive = currentTrack !== null && track.id === currentTrack.id
            const flashing = flashId === track.id
            // Number from the STORE order: the atomic reorderQueue commit lands in
            // completeSettle() the instant the spring rests, so at the flash beat
            // every chip (incl. the landing one) already shows its final slot.
            const storePos = queue.indexOf(track)
            const chipNumber = (storePos >= 0 ? storePos : i) + 1
            return (
              <button
                key={track.id}
                ref={isActive ? activeItemRef : undefined}
                type="button"
                role="listitem"
                onClick={() => onRowClick(i)}
                onPointerDown={(e) => onRowPointerDown(i, e)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
                onPointerCancel={onRowPointerCancel}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'mq-row group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none',
                  'focus-visible:ring-1 focus-visible:ring-ember',
                  liftedIndex === i && 'mq-lifted',
                  isActive
                    ? 'bg-[#EAB308]/15 border border-[#EAB308]/30 text-ink shadow-[0_0_12px_rgba(234,179,8,0.1)]'
                    : 'border border-transparent text-muted hover:bg-white/5 hover:text-ink'
                )}
              >
                <span
                  className={cn(
                    'mq-chip numeric font-mono w-5 shrink-0 text-center text-xs tabular-nums',
                    isActive ? 'font-bold text-ember' : 'text-faint'
                  )}
                  style={
                    flashing
                      ? {
                          color: '#f59e0b',
                          filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.6))',
                          // Snap bright on landing; the class transition owns the 300ms fade-out.
                          transition: 'none'
                        }
                      : undefined
                  }
                >
                  {String(chipNumber).padStart(2, '0')}
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
                  <span className="numeric font-mono text-[11px] tabular-nums text-faint">
                    {formatTime(track.duration_secs)}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </>
  )
}

export default MagneticQueue
