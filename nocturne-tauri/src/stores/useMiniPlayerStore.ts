import { useSyncExternalStore } from 'react'
import {
  getPlayerChannel,
  type BroadcastTrack,
  type CommandAction
} from '../services/player-broadcast'

// Read-only mirror of the main window's playback state for the mini-island.
// This module must never touch HTMLAudioElement — commands go out over the
// BroadcastChannel; main executes them (sole audio authority).

interface MiniSnapshot {
  isPlaying: boolean
  currentTime: number
  duration: number | null
  track: BroadcastTrack | null
}

let snapshot: MiniSnapshot = {
  isPlaying: false,
  currentTime: 0,
  duration: null,
  track: null
}

const listeners = new Set<() => void>()

function set(patch: Partial<MiniSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Selector-based subscription. Selectors must return primitives or stable refs. */
export function useMiniPlayerStore<T>(selector: (s: MiniSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => selector(snapshot))
}

let wired = false

/** Idempotent: attach the STATE_UPDATE consumer once per window. */
function ensureWiring(): void {
  if (wired) return
  wired = true
  const ch = getPlayerChannel()
  ch?.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data
    if (!msg || msg.type !== 'STATE_UPDATE') return
    set(msg.payload)
  })
}

/** Post a transport command to the main window (no-op if channel unavailable). */
export function sendCommand(action: CommandAction, payload?: number): void {
  const ch = getPlayerChannel()
  if (!ch) return
  try {
    ch.postMessage(
      payload === undefined
        ? { type: 'COMMAND', action }
        : { type: 'COMMAND', action, payload }
    )
  } catch {
    // Channel closed — command dropped; UI simply doesn't change.
  }
}

ensureWiring()
