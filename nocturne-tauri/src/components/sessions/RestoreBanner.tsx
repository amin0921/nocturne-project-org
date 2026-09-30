import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { History, RotateCcw, X } from 'lucide-react'
import {
  discardCheckpoint,
  restoreCheckpoint,
  usePlayerStore
} from '../../stores/usePlayerStore'
import { cn } from '../../lib/utils'

/** Row shape returned by the Rust `get_queue_checkpoint` command (camelCase). */
interface CheckpointRecord {
  snapshotJson: string
  trackCount: number
  cleanExit: boolean
  updatedAt: number
}

/** The checkpoint plus everything derived from its snapshot for rendering. */
interface LoadedCheckpoint {
  record: CheckpointRecord
  /** Track paths in snapshot order — the queue identity for dedup comparison. */
  trackPaths: string[]
  activeIndex: number
  subtitle: string
}

function loadCheckpoint(cp: CheckpointRecord): LoadedCheckpoint | null {
  let trackPaths: string[] = []
  let activeIndex = 0
  let subtitle = `${cp.trackCount} tracks`
  try {
    const snap = JSON.parse(cp.snapshotJson) as {
      tracks?: Array<{ path?: string; title?: string }>
      activeIndex?: number
    }
    if (Array.isArray(snap.tracks)) {
      trackPaths = snap.tracks.map((t) => (typeof t.path === 'string' ? t.path : ''))
      const title =
        typeof snap.activeIndex === 'number' ? snap.tracks[snap.activeIndex]?.title : undefined
      if (title) subtitle = `${cp.trackCount} tracks — resumes at “${title}”`
    }
    if (typeof snap.activeIndex === 'number') activeIndex = snap.activeIndex
  } catch {
    // Unreadable snapshot: still offer restore (restoreCheckpoint re-validates
    // and self-clears if genuinely unusable).
  }
  return { record: cp, trackPaths, activeIndex, subtitle }
}

export interface RestoreBannerProps {
  className?: string
}

/**
 * RestoreBanner — launch-time offer to reinstate the persisted queue.
 *
 * Probes `get_queue_checkpoint` once on mount and shows whenever a checkpoint
 * with trackCount > 0 exists — even if the live queue is NOT empty — unless
 * the active queue already matches the checkpoint's identity (same paths in
 * the same order at the same index), which would make restoring a no-op.
 * `cleanExit === false` means the previous run died unexpectedly, so the copy
 * shifts from "continue" to "we recovered". The 15s countdown is a pure-CSS
 * scaleX drain bar (paused while hovered); its `animationend` is the expiry
 * signal. All motion is transform/opacity. [Restore] replaces whatever queue
 * is currently loaded with the snapshot tracks and seeks to the saved position.
 */
export function RestoreBanner({ className }: RestoreBannerProps): JSX.Element | null {
  const queue = usePlayerStore((s) => s.queue)
  const index = usePlayerStore((s) => s.index)
  const [checkpoint, setCheckpoint] = useState<LoadedCheckpoint | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cp = await invoke<CheckpointRecord | null>('get_queue_checkpoint')
        if (cancelled) return
        if (!cp || cp.trackCount <= 0) return
        console.log(
          `[Checkpoint] Found checkpoint on launch (${cp.trackCount} tracks, cleanExit ${cp.cleanExit})`
        )
        setCheckpoint(loadCheckpoint(cp))
      } catch (err) {
        console.debug('[RestoreBanner] get_queue_checkpoint failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Queue identity: identical path order AND same active index → skip offer. */
  const matchesCurrentQueue = useMemo(() => {
    if (!checkpoint) return false
    if (checkpoint.trackPaths.length !== queue.length) return false
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].path !== checkpoint.trackPaths[i]) return false
    }
    return checkpoint.activeIndex === index
  }, [checkpoint, queue, index])

  const close = useCallback((): void => {
    setLeaving(true)
    window.setTimeout(() => setCheckpoint(null), 180)
  }, [])

  const dismiss = useCallback((): void => {
    void discardCheckpoint()
    close()
  }, [close])

  const restore = useCallback((): void => {
    if (!checkpoint) return
    void restoreCheckpoint(checkpoint.record.snapshotJson)
    close()
  }, [checkpoint, close])

  if (!checkpoint || matchesCurrentQueue) return null

  const { record } = checkpoint

  return (
    <div
      role="status"
      dir="auto"
      aria-label="Restore previous queue"
      className={cn('restore-banner', leaving && 'restore-banner-exit', className)}
    >
      <span className="restore-banner-icon" aria-hidden="true">
        {record.cleanExit ? <History size={18} /> : <RotateCcw size={18} />}
      </span>

      <span className="meta flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate text-xs font-semibold text-ink" dir="auto">
          {record.cleanExit ? 'Continue where you left off' : 'We recovered your queue'}
        </span>
        <span className="truncate text-[11px] text-faint" dir="auto">
          {checkpoint.subtitle}
        </span>
      </span>

      <button
        type="button"
        onClick={restore}
        className={cn(
          'shrink-0 rounded-lg bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-black',
          'transition-colors duration-150 hover:bg-[#F5C518]',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/60'
        )}
      >
        Restore
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss restore offer"
        title="Dismiss"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg text-faint',
          'transition-colors duration-150 hover:bg-white/10 hover:text-ink',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20'
        )}
      >
        <X size={14} aria-hidden />
      </button>

      {/* 15s expiry: linear scaleX drain, paused while hovered. Hovering the
          banner also pauses expiry via the CSS rule on .restore-banner:hover. */}
      <span className="restore-drain" onAnimationEnd={dismiss} aria-hidden="true" />
    </div>
  )
}

export default RestoreBanner
