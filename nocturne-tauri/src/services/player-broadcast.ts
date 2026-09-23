// BroadcastChannel bridge between the main window (sole audio authority) and
// the mini-island window. No node/IPC: both windows share the same origin in
// the webview, so BroadcastChannel delivers across windows natively.
// Main: broadcasts STATE_UPDATE, listens COMMAND.
// Mini: broadcasts COMMAND, consumes STATE_UPDATE.

export const PLAYER_CHANNEL_NAME = 'nocturne-player'

export const MINI_POSITION_STORAGE_KEY = 'nocturne:mini-island-pos'
export const MINI_PINNED_STORAGE_KEY = 'nocturne:mini-pinned'

export interface BroadcastTrack {
  title: string
  artist: string
  coverUrl?: string
}

export interface StateUpdateMessage {
  type: 'STATE_UPDATE'
  payload: {
    isPlaying: boolean
    currentTime: number
    duration: number | null
    track: BroadcastTrack | null
  }
}

export type CommandAction = 'togglePlay' | 'next' | 'prev' | 'seek'

export interface CommandMessage {
  type: 'COMMAND'
  action: CommandAction
  payload?: number // seconds, only for 'seek'
}

export type PlayerMessage = StateUpdateMessage | CommandMessage

let channel: BroadcastChannel | null = null

/** Lazily create the shared BroadcastChannel; null if unsupported. */
export function getPlayerChannel(): BroadcastChannel | null {
  if (channel) return channel
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    channel = new BroadcastChannel(PLAYER_CHANNEL_NAME)
    return channel
  } catch {
    return null
  }
}
