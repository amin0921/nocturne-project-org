import { useSyncExternalStore } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { audioController } from '../services/audio-controller'
import { getPlayerChannel, type StateUpdateMessage } from '../services/player-broadcast'
import { toAudioUrl } from '../utils/audio-url'

export interface PlayerTrack {
  id: number
  path: string
  title: string
  artist: string
  album: string
  duration_secs: number | null
  missing: number
  coverUrl?: string
}

export type PlaybackMode = 'normal' | 'shuffle' | 'repeat-all' | 'repeat-one'

function loadFavorites(): Set<number> {
  try {
    const raw = localStorage.getItem('nocturne:favorites')
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return new Set(arr)
    }
  } catch {}
  return new Set()
}

function saveFavorites(favs: Set<number>): void {
  try {
    localStorage.setItem('nocturne:favorites', JSON.stringify(Array.from(favs)))
  } catch {}
}

interface PlayerSnapshot {
  queue: PlayerTrack[]
  index: number
  currentTrack: PlayerTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number | null
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  playbackError: string | null
  favorites: Set<number>
}

type Listener = () => void

let snapshot: PlayerSnapshot = {
  queue: [],
  index: -1,
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: null,
  volume: 80,
  isMuted: false,
  mode: 'normal',
  playbackError: null,
  favorites: loadFavorites()
}

const listeners = new Set<Listener>()

// The main window is the sole audio authority; the mini-island window never
// loads this module (main.tsx demux), but guard anyway so a mis-import can't
// broadcast from the wrong window or create a second audio element.
let isMainWindow = true
try {
  isMainWindow = getCurrentWindow().label === 'main'
} catch {
  isMainWindow = true
}

/** Fan the current playback snapshot out to the mini-island window (~4Hz timeupdate cadence). */
function broadcastState(): void {
  if (!isMainWindow) return
  const ch = getPlayerChannel()
  if (!ch) return
  const track = snapshot.currentTrack
  const msg: StateUpdateMessage = {
    type: 'STATE_UPDATE',
    payload: {
      isPlaying: snapshot.isPlaying,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
      track: track
        ? { title: track.title, artist: track.artist, coverUrl: track.coverUrl }
        : null
    }
  }
  try {
    ch.postMessage(msg)
  } catch {
    // Channel closed / structured-clone failure — mini simply misses an update.
  }
}

function set(patch: Partial<PlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
  broadcastState()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Selector-based subscription. Selectors must return primitives or stable refs. */
export function usePlayerStore<T>(selector: (s: PlayerSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => selector(snapshot))
}

let wired = false

// Consecutive-failure guard: a systematic delivery failure (bad URL, blocked
// protocol) must halt after 3 instead of fast-cycling the whole queue.
const MAX_CONSECUTIVE_FAILURES = 3
let consecutiveFailures = 0
let lastFailureTrackId: number | null = null

function mediaErrorText(error: MediaError | null): string {
  if (!error) return 'unknown audio error'
  switch (error.code) {
    case 1:
      return 'aborted (code 1)'
    case 2:
      return `network unreachable (code 2${error.message ? `: ${error.message}` : ''})`
    case 3:
      return `decode failed (code 3${error.message ? `: ${error.message}` : ''})`
    case 4:
      return `source not supported (code 4${error.message ? `: ${error.message}` : ''})`
    default:
      return `error code ${error.code}${error.message ? `: ${error.message}` : ''}`
  }
}

function resetFailures(): void {
  consecutiveFailures = 0
  lastFailureTrackId = null
  if (snapshot.playbackError !== null) set({ playbackError: null })
}

/**
 * Count one failure for a track (deduped per track so a rejection + error
 * event pair for the same file counts once). Returns true when the cascade
 * must halt and the error is surfaced instead of skipping onward.
 */
function registerFailure(track: PlayerTrack | null, reason: string): boolean {
  const label = track ? `${track.artist} — ${track.title}` : 'no track'
  console.error('[Audio Error]:', track?.path ?? '(none)', '|', reason, '|', label)
  if (track && lastFailureTrackId !== track.id) {
    lastFailureTrackId = track.id
    consecutiveFailures += 1
  }
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    set({ playbackError: `Stopped after ${MAX_CONSECUTIVE_FAILURES} failures — last: ${label} (${reason})` })
    return true
  }
  return false
}

function pickRandomIndex(length: number, exclude: number): number {
  if (length <= 1) return 0
  let next = exclude
  while (next === exclude) next = Math.floor(Math.random() * length)
  return next
}

async function startAt(index: number): Promise<void> {
  const track = snapshot.queue[index] ?? null
  if (!track) return
  set({ index, currentTrack: track, currentTime: 0, duration: track.duration_secs })
  audioController.load(toAudioUrl(track.path))
  try {
    await audioController.play()
    resetFailures()
    set({ isPlaying: true })
  } catch (err) {
    // AbortError on rapid track switches is normal; real failures skip forward.
    if (err instanceof DOMException && err.name === 'AbortError') return
    if (registerFailure(track, `play() rejected: ${err instanceof Error ? err.message : String(err)}`)) return
    void next(true)
  }
}

function ensureWiring(): void {
  if (wired) return
  wired = true
  const el = audioController.element
  el.addEventListener('loadedmetadata', () => {
    set({ duration: Number.isFinite(el.duration) ? el.duration : null })
  })
  el.addEventListener('play', () => {
    resetFailures()
    set({ isPlaying: true })
  })
  el.addEventListener('pause', () => set({ isPlaying: false }))
  el.addEventListener('error', () => {
    if (registerFailure(snapshot.currentTrack, mediaErrorText(audioController.getError()))) return
    void next(true)
  })
  el.addEventListener('ended', () => {
    if (snapshot.mode === 'repeat-one') {
      audioController.seek(0)
      void audioController.play().catch(() => undefined)
      return
    }
    if (snapshot.mode === 'shuffle') {
      void startAt(pickRandomIndex(snapshot.queue.length, snapshot.index))
      return
    }
    if (snapshot.mode === 'repeat-all') {
      void startAt(snapshot.queue.length === 0 ? 0 : (snapshot.index + 1) % snapshot.queue.length)
      return
    }
    if (snapshot.index + 1 < snapshot.queue.length) {
      void startAt(snapshot.index + 1)
    } else {
      set({ isPlaying: false })
    }
  })
  audioController.onTime(() => {
    set({ currentTime: audioController.getTime() })
  })
}

export async function playTracks(tracks: PlayerTrack[], startIndex: number): Promise<void> {
  ensureWiring()
  if (tracks.length === 0) return
  resetFailures()
  set({ queue: tracks, index: Math.min(Math.max(0, startIndex), tracks.length - 1) })
  await startAt(snapshot.index)
}

export async function playTrackAt(index: number): Promise<void> {
  ensureWiring()
  if (index < 0 || index >= snapshot.queue.length) return
  if (index === snapshot.index && snapshot.isPlaying && snapshot.currentTrack?.id === snapshot.queue[index]?.id) return
  resetFailures()
  await startAt(index)
}

export async function togglePlay(): Promise<void> {
  ensureWiring()
  if (!snapshot.currentTrack) {
    const playable = snapshot.queue.filter((t) => t.missing !== 1)
    if (playable.length > 0) await playTracks(playable, 0)
    return
  }
  if (snapshot.isPlaying) {
    audioController.pause()
  } else {
    if (!audioController.element.currentSrc) {
      audioController.load(toAudioUrl(snapshot.currentTrack.path))
    }
    try {
      await audioController.play()
    } catch {
      // Play blocked (e.g. no gesture yet) — stay paused.
    }
  }
}

export async function next(auto = false): Promise<void> {
  ensureWiring()
  if (!auto) resetFailures()
  const { queue, index, mode } = snapshot
  if (queue.length === 0) return
  if (auto && mode === 'normal' && index + 1 >= queue.length) return
  await startAt(mode === 'shuffle' && !auto ? pickRandomIndex(queue.length, index) : (index + 1) % queue.length)
}

export async function prev(): Promise<void> {
  ensureWiring()
  resetFailures()
  const { queue, index } = snapshot
  if (queue.length === 0) return
  if (audioController.getTime() > 3) {
    seekTo(0)
    return
  }
  await startAt((index - 1 + queue.length) % queue.length)
}

export function seekTo(seconds: number): void {
  ensureWiring()
  audioController.seek(seconds)
  set({ currentTime: audioController.getTime() })
}

export function setQueue(tracks: PlayerTrack[], targetIndex?: number): void {
  ensureWiring()
  const currentId = snapshot.currentTrack?.id
  const currentIndex = currentId === undefined ? -1 : tracks.findIndex((t) => t.id === currentId)
  const index = targetIndex === undefined
    ? currentIndex
    : tracks.length === 0
      ? -1
      : Math.min(Math.max(0, targetIndex), tracks.length - 1)
  set({ queue: tracks, index })
}

/**
 * Atomically commit a reordered queue. `index` is re-derived from the
 * currently playing track's id so playback is never interrupted or jumped —
 * the audio element and its position are untouched.
 */
export function reorderQueue(newQueue: PlayerTrack[]): void {
  ensureWiring()
  const currentId = snapshot.currentTrack?.id
  let index: number
  if (newQueue.length === 0) {
    index = -1
  } else if (currentId !== undefined) {
    const found = newQueue.findIndex((t) => t.id === currentId)
    index = found >= 0 ? found : Math.min(Math.max(0, snapshot.index), newQueue.length - 1)
  } else {
    index = snapshot.index >= 0 ? Math.min(snapshot.index, newQueue.length - 1) : -1
  }
  set({ queue: newQueue, index })
}

export function setVolume(volume: number): void {
  ensureWiring()
  const v = Math.min(100, Math.max(0, Math.round(volume)))
  audioController.setVolume(v / 100)
  set({ volume: v })
  if (v > 0 && snapshot.isMuted) {
    audioController.setMuted(false)
    set({ isMuted: false })
  }
}

export function toggleMute(): void {
  ensureWiring()
  const muted = !snapshot.isMuted
  audioController.setMuted(muted)
  set({ isMuted: muted })
}

export function cycleRepeat(): void {
  ensureWiring()
  const order: PlaybackMode[] = ['normal', 'repeat-all', 'repeat-one']
  const current = snapshot.mode === 'shuffle' ? 'normal' : snapshot.mode
  set({ mode: order[(order.indexOf(current) + 1) % order.length] as PlaybackMode })
}

export function toggleShuffle(): void {
  ensureWiring()
  set({ mode: snapshot.mode === 'shuffle' ? 'normal' : 'shuffle' })
}

export function toggleFavorite(trackId: number): boolean {
  const next = new Set(snapshot.favorites)
  const isNowFav = !next.has(trackId)
  if (isNowFav) {
    next.add(trackId)
  } else {
    next.delete(trackId)
  }
  saveFavorites(next)
  set({ favorites: next })
  return isNowFav
}

export function isTrackFavorite(trackId?: number | null): boolean {
  if (trackId === undefined || trackId === null) return false
  return snapshot.favorites.has(trackId)
}

/** Cleanly pauses playback, unloads active audio, and resets queue state */
export function clearQueue(): void {
  ensureWiring()
  try {
    audioController.pause()
    audioController.seek(0)
  } catch (err) {
    console.debug('[AudioController pause error]:', err)
  }
  resetFailures()
  set({
    queue: [],
    index: -1,
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: null,
    playbackError: null
  })
}

export function initPlayer(volume01 = 0.8): void {
  ensureWiring()
  audioController.setVolume(volume01)
}

usePlayerStore.getState = () => ({
  ...snapshot,
  clearQueue,
  setQueue,
  reorderQueue,
  playTracks,
  playTrackAt,
  togglePlay,
  next,
  prev,
  seek: seekTo,
  seekTo,
  setVolume,
  toggleMute,
  cycleRepeat,
  toggleShuffle,
  toggleFavorite,
  isTrackFavorite
})

// Mini-island command bridge: the floating window posts COMMAND messages;
// this listener (main window only) dispatches them to the real controls.
if (isMainWindow) {
  getPlayerChannel()?.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data
    if (!msg || msg.type !== 'COMMAND') return
    switch (msg.action) {
      case 'togglePlay':
        void togglePlay()
        break
      case 'next':
        void next()
        break
      case 'prev':
        void prev()
        break
      case 'seek':
        if (typeof msg.payload === 'number' && Number.isFinite(msg.payload)) {
          seekTo(msg.payload)
        }
        break
    }
  })
}

