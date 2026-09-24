import { useSyncExternalStore } from 'react'
import type { PlayerTrack } from '../../stores/usePlayerStore'

/**
 * Playback history buffer — the last MAX_HISTORY actually-played tracks,
 * newest first. Module-level store (not React state) so player-store actions
 * can record plays outside the component tree via `usePlaybackHistory.getState()`.
 *
 * - Consecutive repeats are deduplicated (repeat-one / re-click).
 * - Metadata is cached per id so entries stay readable (and playable) even
 *   after the live queue has been replaced by a different album.
 */

export interface HistoryEntry {
  id: string
  playedAt: number
}

export interface PlaybackHistoryState {
  history: HistoryEntry[]
  push: (id: string, track?: PlayerTrack) => void
  clearHistory: () => void
  getTrack: (id: string) => PlayerTrack | undefined
}

const MAX_HISTORY = 50

let history: HistoryEntry[] = []
const trackRegistry = new Map<string, PlayerTrack>()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function push(id: string, track?: PlayerTrack): void {
  if (!id) return
  if (track) trackRegistry.set(id, track)
  if (history[0]?.id === id) return
  history = [{ id, playedAt: Date.now() }, ...history].slice(0, MAX_HISTORY)
  emit()
}

function clearHistory(): void {
  if (history.length === 0) return
  history = []
  emit()
}

function getTrack(id: string): PlayerTrack | undefined {
  return trackRegistry.get(id)
}

let state: PlaybackHistoryState = { history, push, clearHistory, getTrack }

function getState(): PlaybackHistoryState {
  if (state.history !== history) state = { ...state, history }
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePlaybackHistory<T>(selector: (s: PlaybackHistoryState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(getState())
  )
}

usePlaybackHistory.getState = getState

export { push as pushHistory, clearHistory, getTrack as getHistoryTrack, MAX_HISTORY }

export default usePlaybackHistory
