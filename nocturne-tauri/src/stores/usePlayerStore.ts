import { useSyncExternalStore } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { audioController } from '../services/audio-controller'
import { getPlayerChannel, type StateUpdateMessage } from '../services/player-broadcast'
import { hasMiniWindow } from '../services/mini-window'
import { toAudioUrl } from '../utils/audio-url'
import { parseLrc, type LyricLine } from '../utils/lrcParser'
import { fetchLyricsOnline } from '../services/lyricsService'
import { usePlaybackHistory } from '../components/queue/usePlaybackHistory'
import {
  cancelSleepIfTrackBound,
  handleSleepTrackEnded,
  notifySleepProgress,
  notifySleepQueueEnd
} from './useSleepTimer'

export interface PlayerTrack {
  id: number
  path: string
  title: string
  artist: string
  album: string
  duration_secs: number | null
  missing: number
  coverUrl?: string
  /**
   * Unique per queue slot. Assigned whenever a track is spliced INTO the queue,
   * so two rows holding the same library track (e.g. "Play Next" on the song
   * that is already playing) never share a React key or a FLIP identity.
   */
  queueId?: string
}

/** Monotonic queue-slot identity generator (never reused within a session). */
let queueIdSeq = 0

function nextQueueId(): string {
  queueIdSeq += 1
  return `q${queueIdSeq}`
}

/** Stable row identity: the queue slot id when present, else the library id. */
export function queueItemId(track: PlayerTrack): string {
  return track.queueId ?? String(track.id)
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
  /** Context queue: the pristine album / playlist / folder, never mutated by "Play Next". */
  queue: PlayerTrack[]
  /**
   * User Queue (priority tier): tracks explicitly queued via "Play Next" /
   * "Add to End of Queue". Playback drains this list FIRST, one track at a
   * time, without ever moving `index` inside the context queue — so the album
   * order, numbering and active highlight stay exactly where the user left them.
   */
  priorityQueue: PlayerTrack[]
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
  currentLyrics: LyricLine[]
}

type Listener = () => void

let snapshot: PlayerSnapshot = {
  queue: [],
  priorityQueue: [],
  index: -1,
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: null,
  volume: 80,
  isMuted: false,
  mode: 'normal',
  playbackError: null,
  favorites: loadFavorites(),
  currentLyrics: []
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

/**
 * Fan the current playback snapshot out to the mini-island window (~4Hz
 * timeupdate cadence).
 *
 * P0 idle-CPU fix: the mini window is created on demand and destroyed on
 * restore, so for the vast majority of a session there is NO listener. Every
 * unconditional postMessage still walked the structured-clone + BroadcastChannel
 * dispatch path on the main renderer for nothing. Skip it entirely unless a
 * mini-island window actually exists (App.tsx owns the lifecycle and publishes
 * the handle); the cadence itself is unchanged while the mini is present.
 */
function broadcastState(): void {
  if (!isMainWindow) return
  if (!hasMiniWindow()) return
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

/**
 * One-shot state push to the mini-island.
 *
 * P0 on-demand lifecycle: the mini window is built fresh on every minimize, so
 * it mounts with an empty mirror store. Without this priming push the pill
 * would sit blank for up to one ~4Hz tick after appearing. Called by App.tsx
 * right after the window reports ready, before it is shown.
 */
export function publishPlayerState(): void {
  broadcastState()
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

let lyricsAbortController: AbortController | null = null

/**
 * Resolves the playback duration in SECONDS for strict online-lyrics edition
 * matching. The duration is MANDATORY for candidate filtering whenever it can
 * be derived from the audio track, so this helper is what keeps the LRCLIB
 * search from accepting an edition whose timing runs away (e.g. a radio edit
 * with a 10s-shorter intro).
 *
 * Order: live store duration (scanner metadata, set synchronously by
 * `startAt`, refreshed by `loadedmetadata`) → a bounded wait for the audio
 * element's `loadedmetadata` event. Resolves `undefined` after `timeoutMs` so
 * a genuinely underivable duration can never hang the lyrics pipeline.
 */
export function resolvePlaybackDuration(timeoutMs = 2500): Promise<number | undefined> {
  const valid = (v: number | null | undefined): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined

  const immediate = valid(snapshot.duration)
  if (immediate) return Promise.resolve(immediate)

  const el = audioController.element
  return new Promise<number | undefined>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      el.removeEventListener('loadedmetadata', finish)
      window.clearTimeout(timer)
      resolve(valid(el.duration) ?? valid(snapshot.duration))
    }
    const timer = window.setTimeout(finish, timeoutMs)
    el.addEventListener('loadedmetadata', finish)
  })
}

async function loadLyricsForTrack(track: PlayerTrack): Promise<void> {
  lyricsAbortController?.abort()
  const ac = new AbortController()
  lyricsAbortController = ac

  const rawPath =
    (track as any).file_path ||
    (typeof (track as any).id === 'string' && ((track as any).id.includes('/') || (track as any).id.includes('\\'))
      ? (track as any).id
      : null) ||
    track.path ||
    (typeof (track as any).id === 'string' ? (track as any).id : '')
  const audioPath = typeof rawPath === 'string' ? rawPath.trim() : ''

  try {
    // 1. Try local sibling .lrc beside audio file
    if (audioPath) {
      const localLrc = await invoke<string | null>('get_lyrics', { filePath: audioPath })
      if (ac.signal.aborted) return
      if (localLrc && localLrc.trim().length > 0) {
        const parsed = parseLrc(localLrc)
        if (parsed.length > 0) {
          set({ currentLyrics: parsed })
          return
        }
      }
    }

    // 2. Fallback to online LRCLIB
    if (track.title) {
      // Mandatory duration match: derive the track duration (scanner metadata
      // → live audio metadata, bounded wait) so /api/search can never accept
      // an edition whose timing runs away from the real track.
      const targetDuration = await resolvePlaybackDuration()
      if (ac.signal.aborted) return
      const online = await fetchLyricsOnline(track.title, track.artist || '', targetDuration)
      if (ac.signal.aborted) return
      if (online && online.lrc.trim().length > 0) {
        // tagOffsetMs (LRC [offset:±ms] header) is carried per line; the sync
        // engine applies it exactly once alongside the user calibration.
        const parsed = parseLrc(online.lrc, online.tagOffsetMs)
        set({ currentLyrics: parsed })
        // Cache to sibling .lrc for future offline use
        if (audioPath) {
          invoke('save_cached_lyrics', { filePath: audioPath, content: online.lrc }).catch((err) => {
            console.debug('[usePlayerStore] Could not cache lyrics:', err)
          })
        }
      }
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      console.debug('[usePlayerStore] Lyric fetch error:', err)
    }
  }
}

export function setCurrentLyrics(lyrics: LyricLine[]): void {
  set({ currentLyrics: lyrics })
}

interface PlayTrackingSession {
  track: PlayerTrack
  accumulatedMs: number
  lastTickTime: number | null
  hasRecorded: boolean
}

let activeSession: PlayTrackingSession | null = null

function updatePlayTrackingTime(isCurrentlyPlaying: boolean): void {
  if (!activeSession) return
  const now = performance.now()
  if (isCurrentlyPlaying && activeSession.lastTickTime !== null) {
    const delta = now - activeSession.lastTickTime
    if (delta > 0 && delta < 5000) {
      activeSession.accumulatedMs += delta
    }
  }
  activeSession.lastTickTime = isCurrentlyPlaying ? now : null

  if (!activeSession.hasRecorded && activeSession.accumulatedMs >= 15000) {
    activeSession.hasRecorded = true
    flushActiveSessionPlay()
  }
}

function flushActiveSessionPlay(): void {
  if (!activeSession) return
  const s = activeSession
  const durationMs = Math.round(
    s.track.duration_secs && s.track.duration_secs > 0
      ? s.track.duration_secs * 1000
      : s.accumulatedMs
  )
  invoke('record_play', {
    trackId: String(s.track.id),
    title: s.track.title,
    artist: s.track.artist,
    album: s.track.album || null,
    durationMs: Math.max(1000, durationMs)
  }).catch((err) => {
    console.debug('[usePlayerStore] record_play error:', err)
  })
}

function finishActiveSession(reason: 'ended' | 'skip'): void {
  if (!activeSession) return
  updatePlayTrackingTime(false)
  if (!activeSession.hasRecorded) {
    if (reason === 'ended' || activeSession.accumulatedMs >= 15000) {
      activeSession.hasRecorded = true
      flushActiveSessionPlay()
    }
  }
  activeSession = null
}

function startPlaySession(track: PlayerTrack): void {
  if (activeSession && activeSession.track.id !== track.id) {
    finishActiveSession('skip')
  }
  activeSession = {
    track,
    accumulatedMs: 0,
    lastTickTime: performance.now(),
    hasRecorded: false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    finishActiveSession('skip')
  })
}

/**
 * Single playback entry point. `nextIndex === null` means "play this track
 * WITHOUT touching the context position" — that is exactly the priority tier
 * contract: the album keeps its pointer, only the audio changes.
 */
async function startTrack(track: PlayerTrack | null, nextIndex: number | null): Promise<void> {
  if (!track) return
  startPlaySession(track)
  if (nextIndex === null) {
    set({ currentTrack: track, currentTime: 0, duration: track.duration_secs, currentLyrics: [] })
  } else {
    set({ index: nextIndex, currentTrack: track, currentTime: 0, duration: track.duration_secs, currentLyrics: [] })
  }
  void loadLyricsForTrack(track)
  audioController.load(toAudioUrl(track.path))
  try {
    await audioController.play()
    resetFailures()
    set({ isPlaying: true })
    if (activeSession) activeSession.lastTickTime = performance.now()
    // Record the play once the engine actually started it (dedupes repeats).
    usePlaybackHistory.getState().push(String(track.id), track)
  } catch (err) {
    // AbortError on rapid track switches is normal; real failures skip forward.
    if (err instanceof DOMException && err.name === 'AbortError') return
    if (registerFailure(track, `play() rejected: ${err instanceof Error ? err.message : String(err)}`)) return
    void next(true)
  }
}

/** Play a CONTEXT row: this is the only call path that may move `index`. */
function startAt(index: number): Promise<void> {
  return startTrack(snapshot.queue[index] ?? null, index)
}

/**
 * Shift the head off the priority tier and play it with the context pointer
 * frozen in place. Returns false when the tier is empty, so callers fall
 * through to normal context advancement. The shift happens BEFORE the async
 * play() so a rapid double `next()` can never pop the same row twice.
 */
function takePriorityHead(): Promise<boolean> {
  const head = snapshot.priorityQueue[0]
  if (!head) return Promise.resolve(false)
  set({ priorityQueue: snapshot.priorityQueue.slice(1) })
  return startTrack(head, null).then(() => true)
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
    if (activeSession) activeSession.lastTickTime = performance.now()
  })
  el.addEventListener('pause', () => {
    set({ isPlaying: false })
    updatePlayTrackingTime(false)
  })
  el.addEventListener('error', () => {
    if (registerFailure(snapshot.currentTrack, mediaErrorText(audioController.getError()))) return
    void next(true)
  })
  el.addEventListener('ended', () => {
    finishActiveSession('ended')
    // End of Track sleep preset claims the stop: pause here, never advance.
    if (handleSleepTrackEnded()) return
    if (snapshot.mode === 'repeat-one') {
      audioController.seek(0)
      void audioController.play().catch(() => undefined)
      return
    }
    // Priority tier wins over every context mode (shuffle / repeat-all alike):
    // an explicit "Play Next" always plays before the album continues.
    if (snapshot.priorityQueue.length > 0) {
      void takePriorityHead()
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
      // End of Queue sleep preset completes exactly at this natural stop.
      notifySleepQueueEnd()
    }
  })
  audioController.onTime(() => {
    set({ currentTime: audioController.getTime() })
    updatePlayTrackingTime(snapshot.isPlaying)
    notifySleepProgress(audioController.getTime(), snapshot.duration)
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

/**
 * Playback stepper. The PRIORITY tier is always consulted first: while the user
 * queue holds anything, `next()` (manual or auto) plays it with `index` frozen.
 * Only once the tier is empty does the context album advance by one.
 */
export async function next(auto = false): Promise<void> {
  ensureWiring()
  if (!auto) resetFailures()
  if (snapshot.priorityQueue.length > 0) {
    await takePriorityHead()
    return
  }
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

/**
 * Commit a new queue ORDER (drag-and-drop / undo) given only queue row ids
 * (`queueItemId` — unique per slot, so duplicate library tracks reorder safely).
 * Existing track objects are preserved byte-for-byte — nothing is cloned or
 * re-fetched — ids missing from `order` are re-appended in place, and ids that
 * do not belong to the queue are ignored. Index re-derivation (and therefore
 * uninterrupted playback) is delegated to `reorderQueue`.
 */
export function setQueueOrder(order: string[]): void {
  ensureWiring()
  const current = snapshot.queue
  if (current.length === 0) return

  const indexById = new Map<string, number>()
  current.forEach((track, i) => {
    const key = queueItemId(track)
    if (!indexById.has(key)) indexById.set(key, i)
  })

  const next: PlayerTrack[] = []
  const placed = new Set<number>()
  order.forEach((raw) => {
    const at = indexById.get(raw)
    if (at === undefined || placed.has(at)) return
    next.push(current[at])
    placed.add(at)
  })
  // Defensive tail: never drop a track the caller omitted.
  current.forEach((track, i) => {
    if (placed.has(i)) return
    next.push(track)
    placed.add(i)
  })

  reorderQueue(next)
}

/**
 * Burst guard: two identical queue mutations inside QUEUE_BURST_MS collapse into
 * one, so a double-fired menu click (or an impatient rapid re-click) can never
 * splice 2-3 duplicate rows in a single gesture. Only ACCEPTED calls refresh the
 * window, so a blocked call can never starve a later legitimate one.
 */
const QUEUE_BURST_MS = 300
const lastQueueActionAt = new Map<string, number>()

function isQueueBurst(action: 'playNext' | 'addToQueue', trackId: number): boolean {
  const key = `${action}:${trackId}`
  const now = Date.now()
  const previous = lastQueueActionAt.get(key)
  if (previous !== undefined && now - previous < QUEUE_BURST_MS) return true
  lastQueueActionAt.set(key, now)
  if (lastQueueActionAt.size > 64) {
    const oldest = lastQueueActionAt.keys().next()
    if (!oldest.done) lastQueueActionAt.delete(oldest.value)
  }
  return false
}

/**
 * Detach every copy of `trackId` from the priority tier, returning the first
 * one found (so a re-queued song is MOVED, never cloned) plus the survivors.
 * The context queue is never read or written here — this is the only list the
 * dual-tier mutations are allowed to touch.
 */
function extractPriorityCopies(
  source: PlayerTrack[],
  trackId: number
): { rows: PlayerTrack[]; taken: PlayerTrack | null } {
  const rows: PlayerTrack[] = []
  let taken: PlayerTrack | null = null
  for (const row of source) {
    if (row.id === trackId) {
      if (!taken) taken = row
      continue
    }
    rows.push(row)
  }
  return { rows, taken }
}

/**
 * "Play Next" — prepend to the PRIORITY tier. The context playlist
 * (`queue`) and its `index` are left byte-for-byte untouched, so the album
 * never scrambles, never loses a row and never renumbers itself.
 *
 * Deduplication: a song already sitting in the priority tier is MOVED to the
 * front (its existing `queueId` is preserved so React never remounts the row)
 * instead of being inserted twice. With no context queue at all there is no
 * album to protect, so the track simply starts playing.
 */
export function playNext(track: PlayerTrack): void {
  ensureWiring()
  if (isQueueBurst('playNext', track.id)) return
  if (snapshot.queue.length === 0) {
    void playTracks([track], 0)
    return
  }
  const { rows, taken } = extractPriorityCopies(snapshot.priorityQueue, track.id)
  const item = taken ?? { ...track, queueId: nextQueueId() }
  set({ priorityQueue: [item, ...rows] })
}

/**
 * "Add to End of Queue" — append to the PRIORITY tier. No-op when the song is
 * already the tail entry; otherwise an earlier copy is lifted and re-appended
 * ONCE (no duplicates, no context mutation).
 */
export function addToQueue(track: PlayerTrack): void {
  ensureWiring()
  if (isQueueBurst('addToQueue', track.id)) return
  if (snapshot.queue.length === 0) {
    void playTracks([track], 0)
    return
  }
  const { rows, taken } = extractPriorityCopies(snapshot.priorityQueue, track.id)
  const item = taken ?? { ...track, queueId: nextQueueId() }
  set({ priorityQueue: [...rows, item] })
}

/**
 * Drop one user-queued row by its priority-slot id (`queueItemId`). Playback
 * and the context queue are untouched — this only edits the priority tier.
 */
export function removeFromPriorityQueue(queueId: string): void {
  ensureWiring()
  const rows = snapshot.priorityQueue
  const at = rows.findIndex((t) => queueItemId(t) === queueId)
  if (at < 0) return
  set({ priorityQueue: rows.filter((_, i) => i !== at) })
}

/** Empty the user queue (context playlist keeps playing untouched). */
export function clearPriorityQueue(): void {
  ensureWiring()
  if (snapshot.priorityQueue.length === 0) return
  set({ priorityQueue: [] })
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
  finishActiveSession('skip')
  cancelSleepIfTrackBound()
  lyricsAbortController?.abort()
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
    priorityQueue: [],
    index: -1,
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: null,
    playbackError: null,
    currentLyrics: []
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
  playNext,
  addToQueue,
  removeFromPriorityQueue,
  clearPriorityQueue,
  reorderQueue,
  setQueueOrder,
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
  isTrackFavorite,
  setCurrentLyrics
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

