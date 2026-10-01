import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { modKey } from '../../lib/platform'

/**
 * UndoToast — luxury obsidian-glass toast anchored in the queue panel
 * (PATCH 04 surface, PATCH 05 motion).
 *
 * The countdown is a pure-CSS drain bar (PATCH 05 §4): a 2px amber bar drains
 * `scaleX 1 → 0` over `windowMs` linear from the left, pauses while hovered,
 * and its `animationend` triggers dismissal — zero rAF, zero React re-renders
 * for the countdown. Intro/outro are the §2 keyframes (240ms in with blur,
 * 180ms ease-out down-fade). Ctrl/Cmd+Z is handled globally by useQueueUndo;
 * this component only shows the hint badge.
 */

const OUTRO_MS = 180

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
  const [internalLeaving, setInternalLeaving] = useState(false)
  const isLeaving = leaving || internalLeaving
  const dismissed = useRef(false)
  const handlers = useRef({ onUndo, onDismiss })
  const outroTimer = useRef<number | null>(null)

  useEffect(() => {
    handlers.current = { onUndo, onDismiss }
  })

  const finish = useCallback((action: 'undo' | 'dismiss') => {
    if (dismissed.current) return
    dismissed.current = true
    if (action === 'undo') {
      handlers.current.onUndo()
    }
    setInternalLeaving(true)
    outroTimer.current = window.setTimeout(() => {
      handlers.current.onDismiss()
    }, OUTRO_MS)
  }, [])

  useEffect(
    () => () => {
      if (outroTimer.current !== null) window.clearTimeout(outroTimer.current)
    },
    []
  )

  // Escape dismisses; Ctrl/Cmd+Z undo lives in useQueueUndo's global chord.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      finish('dismiss')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finish])

  /** Expiry: the drain bar reaching scaleX(0) dismisses — no timers, no ticks. */
  const onDrainAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLSpanElement>) => {
      if (e.target !== e.currentTarget) return
      finish('dismiss')
    },
    [finish]
  )

  return (
    <div className="nq-toast-zone">
      <div
        className={cn(
          'nq-toast rounded-xl border border-[#232936] bg-[#121419]/95 p-3 text-xs shadow-2xl backdrop-blur-md',
          isLeaving && 'nq-toast-out'
        )}
        data-leaving={isLeaving}
        role="status"
        aria-live="polite"
      >
        <Undo2 size={14} strokeWidth={2.2} className="shrink-0 text-[#EAB308]" aria-hidden />
        <span className="nq-toast-msg shrink-0" dir="auto">
          {message || 'Reordered'}
        </span>
        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#EAB308] outline-none transition-all hover:text-[#F2F3F5] focus-visible:ring-1 focus-visible:ring-[#EAB308]/50 active:scale-[0.96]"
          onClick={() => finish('undo')}
        >
          <span>Undo</span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/50">
            {modKey() === '⌘' ? '⌘Z' : `${modKey()}+Z`}
          </kbd>
        </button>
        <button
          type="button"
          className="nq-toast-close shrink-0 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/50"
          onClick={() => finish('dismiss')}
          aria-label="Dismiss"
        >
          <X size={14} aria-hidden />
        </button>
        <span
          className="nq-toast-drain"
          style={{ animationDuration: `${windowMs}ms` }}
          onAnimationEnd={onDrainAnimationEnd}
          aria-hidden="true"
        />
      </div>
    </div>
  )
})

export default UndoToast
