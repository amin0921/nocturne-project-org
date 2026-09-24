import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Snapshot-based queue undo safety net.
 *
 * Before any reorder the current id order is captured into a single snapshot
 * (not an operation stack), so Undo is one deterministic restore instead of a
 * chain of inverse mutations. The snapshot lives for UNDO_WINDOW_MS; the global
 * Ctrl/Cmd+Z chord and the toast's Undo button both resolve through the same
 * `undo()` path. A second reorder inside the window simply replaces the snapshot.
 */

export interface QueueSnapshot {
  /** Track ids in the order they were in BEFORE the change. */
  order: string[]
  /** Human label for the toast, e.g. "Queue order". */
  label: string
  /** Epoch ms when the snapshot was taken. */
  at: number
}

export const UNDO_WINDOW_MS = 5000

export interface QueueUndoApi {
  snapshot: QueueSnapshot | null
  beginReorder: (currentOrder: string[], label?: string) => void
  undo: () => void
  dismiss: () => void
  windowMs: number
}

export function useQueueUndo(onRestore: (order: string[]) => void): QueueUndoApi {
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

  /** Capture the pre-change order. Call this BEFORE mutating the store. */
  const beginReorder = useCallback(
    (currentOrder: string[], label = 'Queue order') => {
      clearTimer()
      setSnapshot({ order: [...currentOrder], label, at: Date.now() })
      // Fail-safe fallback timer (7000ms) so UndoToast's 5s countdown + 320ms outro finish cleanly
      timer.current = window.setTimeout(() => {
        timer.current = null
        setSnapshot(null)
      }, UNDO_WINDOW_MS + 2000)
    },
    [clearTimer]
  )

  const undo = useCallback(() => {
    if (!snapshot) return
    onRestore(snapshot.order)
    dismiss()
  }, [snapshot, onRestore, dismiss])

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

  return { snapshot, beginReorder, undo, dismiss, windowMs: UNDO_WINDOW_MS }
}

export default useQueueUndo
