import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Snapshot-based queue undo safety net.
 *
 * Before any destructive queue action (reorder / remove row / clear queue) the
 * caller captures ONE snapshot — a label plus a deterministic `restore`
 * closure — so Undo is a single restore instead of a chain of inverse
 * mutations. The snapshot lives for UNDO_WINDOW_MS; the global Ctrl/Cmd+Z
 * chord and the toast's Undo button both resolve through the same `undo()`
 * path. A second action inside the window simply replaces the snapshot.
 */

export interface QueueSnapshot {
  /** Human label for the toast, e.g. "Reordered". */
  label: string
  /** Epoch ms when the snapshot was taken. */
  at: number
  /** One deterministic restore of the pre-action state. */
  restore: () => void
}

/** How long the UndoToast stays actionable (its drain bar mirrors this). */
export const UNDO_WINDOW_MS = 10000

export interface QueueUndoApi {
  snapshot: QueueSnapshot | null
  begin: (snapshot: { label: string; restore: () => void }) => void
  undo: () => void
  dismiss: () => void
  windowMs: number
}

export function useQueueUndo(): QueueUndoApi {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null)
  const timer = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setSnapshot(null)
  }, [clearTimer])

  /** Capture the pre-action state. Call this BEFORE (or atomically with) mutating the store. */
  const begin = useCallback(
    ({ label, restore }: { label: string; restore: () => void }) => {
      clearTimer()
      setSnapshot({ label, restore, at: Date.now() })
      // Fail-safe fallback timer so the toast's drain + 180ms outro always
      // finish cleanly even if the drain bar's animationend is missed.
      timer.current = window.setTimeout(() => {
        timer.current = null
        setSnapshot(null)
      }, UNDO_WINDOW_MS + 2000)
    },
    [clearTimer]
  )

  const undo = useCallback(() => {
    if (!snapshot) return
    snapshot.restore()
    dismiss()
  }, [snapshot, dismiss])

  // Global Ctrl+Z / Cmd+Z (no Shift) restores the snapshot instantly.
  useEffect(() => {
    const isTyping = (): boolean => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName || ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      return el instanceof HTMLElement && el.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.shiftKey) return
      if (e.key !== 'z' && e.key !== 'Z' && e.code !== 'KeyZ') return
      if (!snapshot || isTyping()) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [snapshot, undo])

  useEffect(() => clearTimer, [clearTimer])

  return { snapshot, begin, undo, dismiss, windowMs: UNDO_WINDOW_MS }
}

export default useQueueUndo
