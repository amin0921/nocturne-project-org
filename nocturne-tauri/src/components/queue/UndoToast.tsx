import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * UndoToast — floating obsidian-glass toast anchored in the queue panel.
 *
 * The 5s countdown is driven directly via requestAnimationFrame directly on the
 * SVG circle's strokeDashoffset without React state updates, delivering 144Hz
 * silky-smooth draining with 0 re-renders. Transitions use CSS opacity/transform
 * rather than @keyframes to prevent double-flicker on queue updates. Memoized
 * with React.memo to stay steady when the queue changes.
 */

const RING_RADIUS = 9
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export interface UndoToastProps {
  message?: string
  windowMs: number
  /** True while the panel plays the exit animation (snapshot already cleared). */
  leaving?: boolean
  onUndo: () => void
  onDismiss: () => void
}

export const UndoToast = React.memo(function UndoToast({
  message = 'Reordered',
  windowMs,
  leaving = false,
  onUndo,
  onDismiss
}: UndoToastProps): JSX.Element {
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const ringRef = useRef<SVGCircleElement>(null)
  const handlers = useRef({ onUndo, onDismiss })
  const dismissed = useRef(false)

  useEffect(() => {
    handlers.current = { onUndo, onDismiss }
  })

  const [internalLeaving, setInternalLeaving] = useState(false)
  const isLeaving = leaving || internalLeaving

  // Start with opacity-0 translate-y-3 and transition smoothly into place
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const finish = useCallback((action: 'undo' | 'dismiss') => {
    if (dismissed.current) return
    dismissed.current = true
    if (action === 'undo') {
      handlers.current.onUndo()
    }
    setInternalLeaving(true)
    window.setTimeout(() => {
      handlers.current.onDismiss()
    }, 320)
  }, [])

  // 144Hz silky-smooth direct DOM ring countdown with zero React re-renders
  useEffect(() => {
    const state = { start: 0, elapsed: 0, raf: 0 }
    let finished = false

    const tick = (now: number): void => {
      if (!state.start) state.start = now
      if (!hovered && !isLeaving) {
        state.elapsed += now - state.start
      }
      state.start = now

      const progress = Math.min(1, state.elapsed / windowMs)
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE * progress)
      }

      if (progress >= 1) {
        if (!finished) {
          finished = true
          finish('dismiss')
        }
        return
      }

      state.raf = requestAnimationFrame(tick)
    }

    state.raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(state.raf)
    }
  }, [windowMs, hovered, isLeaving, finish])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      finish('dismiss')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finish])

  const isVisible = mounted && !isLeaving

  return (
    <div className="nq-toast-zone">
      <div
        className={cn(
          'nq-toast px-3 py-1.5 gap-2',
          !mounted && 'opacity-0 translate-y-[18px] scale-[0.94] blur-[6px]',
          isVisible && 'opacity-100 translate-y-0 scale-100 blur-0',
          isLeaving && 'opacity-0 translate-y-[18px] scale-[0.94] blur-[6px] pointer-events-none'
        )}
        data-entering={!mounted}
        data-visible={isVisible}
        data-leaving={isLeaving}
        role="status"
        aria-live="polite"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <svg
          className="nq-ring shrink-0 overflow-visible"
          style={{ overflow: 'visible' }}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="bg" cx="12" cy="12" r={RING_RADIUS} fill="none" strokeWidth="2.5" />
          <circle
            ref={ringRef}
            className="fg"
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset="0"
          />
        </svg>
        <span className="nq-toast-msg shrink-0">{message || 'Reordered'}</span>
        <button
          type="button"
          className="nq-toast-undo flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-[#f59e0b] border border-amber-500/25 active:scale-[0.98] outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50 transition-all"
          onClick={() => finish('undo')}
        >
          <Undo2 size={13} strokeWidth={2.2} aria-hidden />
          <span>Undo</span>
          <kbd className="text-[10px] text-white/50 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded font-mono">
            Ctrl+Z
          </kbd>
        </button>
        <button
          type="button"
          className="nq-toast-close outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50"
          onClick={() => finish('dismiss')}
          aria-label="Dismiss"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
})

export default UndoToast
