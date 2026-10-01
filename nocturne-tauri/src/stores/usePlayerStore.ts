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

/**
 * Pre-replacement capture of the live queue (taken right before a session's
 * "Replace Queue" mutates it) so the displacement is one-click reversible.
 */
export interface PreviousQueueSnapshot {
  tracks: PlayerTrack[]
  activeIndex: number
  positionMs: number
}

/**
 * Pre-mutation capture for DESTRUCTIVE queue actions (remove row / clear
 * queue), so the UndoToast's one-click restore can reinstate the exact
 * pre-action state: both tiers, the playhead and the playback position.
 */
export interface QueueUndoSnapshot {
  tracks: PlayerTrack[]
  priorityQueue: PlayerTrack[]
  activeIndex: number
  positionMs: number
}

function captureQueueUndoSnapshot(): QueueUndoSnapshot {
  return {
    tracks: [...snapshot.queue],
    priorityQueue: [...snapshot.priorityQueue],
    activeIndex: snapshot.index,
    positionMs: Math.max(0, Math.round(snapshot.currentTime * 1000))
  }
}

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
  /** Queue displaced by the latest Replace Queue (null = nothing to undo). */
  previousQueueSnapshot: PreviousQueueSnapshot | null
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
  currentLyrics: [],
  previousQueueSnapshot: null
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
  // Queue checkpointing (Feature 3): only STRUCTURAL playback changes debounced
  // a checkpoint write — the ~4Hz currentTime/duration ticks never touch SQLite.
  const structural =
    'queue' in patch ||
    'index' in patch ||
    'currentTrack' in patch ||
    'isPlaying' in patch ||
    'mode' in patch
  snapshot = { ...snapshot, ...patch }
  if (structural) scheduleCheckpoint()
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

/**
 * Listening-history flush (Phase 01 · Feature 2): exactly ONE
 * `record_listening_history` invoke per track transition — no periodic
 * writes. Status per research spec: natural end OR >= 90% of duration heard
 * → 'completed' (so short tracks that finish naturally are never 'skipped'),
 * < 30s heard → 'skipped', otherwise 'partial'. `trackId` is the canonical
 * path so history survives rescans (track row ids are reassigned on rescan).
 */
function flushListeningHistory(session: PlayTrackingSession, reason: 'ended' | 'skip'): void {
  const listenedSecs = session.accumulatedMs / 1000
  if (listenedSecs <= 0) return
  const track = session.track
  const duration =
    track.duration_secs && track.duration_secs > 0 ? track.duration_secs : null
  let status: 'completed' | 'skipped' | 'partial'
  if (reason === 'ended') {
    status = 'completed'
  } else if (duration !== null && listenedSecs >= duration * 0.9) {
    status = 'completed'
  } else if (listenedSecs < 30) {
    status = 'skipped'
  } else {
    status = 'partial'
  }
  invoke('record_listening_history', {
    trackId: track.path,
    title: track.title,
    artist: track.artist,
    durationSecs: duration ?? 0,
    durationListenedSecs: listenedSecs,
    status
  }).catch((err) => {
    console.debug('[usePlayerStore] record_listening_history error:', err)
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
  flushListeningHistory(activeSession, reason)
  activeSession = null
  // Immediate (non-debounced) checkpoint on track stop/advance: guarantees the
  // pre-advance queue state survives a crash within the 2s debounce window.
  if (!unloading) flushCheckpoint(false)
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

/** True once beforeunload fired — suppresses clean=false flushes racing the
 * final clean=true write (WebView2 may kill the process mid-IPC). */
let unloading = false

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    unloading = true
    finishActiveSession('skip')
    // Graceful shutdown: persist the live snapshot immediately with the clean
    // marker, then flip the checkpoint's clean_exit via the dedicated command
    // (belt & braces — the save itself already carries cleanExit=true).
    // The unloading flag suppresses finishActiveSession's own clean=false
    // flush so the two writes can never race into inverted order.
    flushCheckpoint(true)
    invoke('mark_checkpoint_clean_exit').catch((err) => {
      console.debug('[usePlayerStore] mark_checkpoint_clean_exit error:', err)
    })
  })
}

// ---------------------------------------------------------------------
// Queue checkpoint (Phase 01 · Feature 3)
//
// Debounced persistence of the playback state into the SQLite singleton.
// Writes fire ONLY on structural changes (queue/index/track/play-state/mode),
// 2s after the last one — the ~4Hz timeupdate clock never reaches SQLite, so
// idle CPU stays at zero and the database is written at most once per 2s of
// activity. Position is read from the store at write time, which is exactly
// the "coarse interval" contract: track change/pause refresh it for free.
// ---------------------------------------------------------------------

interface CheckpointSnapshot {
  tracks: PlayerTrack[]
  activeIndex: number
  positionMs: number
  isShuffle: boolean
  repeatMode: PlaybackMode
}

const CHECKPOINT_DEBOUNCE_MS = 2000

let checkpointTimer: number | null = null

function buildCheckpointSnapshot(): CheckpointSnapshot {
  const { queue, index, mode, currentTime } = snapshot
  return {
    // queueId is per-session identity; a restored queue mints fresh ones.
    tracks: queue.map((t) => ({ ...t, queueId: undefined })),
    activeIndex: index,
    positionMs: Math.max(0, Math.round(currentTime * 1000)),
    isShuffle: mode === 'shuffle',
    repeatMode: mode === 'shuffle' ? 'normal' : mode
  }
}

function flushCheckpoint(cleanExit = false): void {
  if (checkpointTimer !== null) {
    window.clearTimeout(checkpointTimer)
    checkpointTimer = null
  }
  const payload = buildCheckpointSnapshot()
  console.log(
    `[Checkpoint] Saved checkpoint (${payload.tracks.length} tracks, index ${payload.activeIndex}, cleanExit ${cleanExit})`
  )
  invoke('save_queue_checkpoint', {
    snapshotJson: JSON.stringify(payload),
    trackCount: payload.tracks.length,
    cleanExit
  }).catch((err) => {
    console.debug('[usePlayerStore] save_queue_checkpoint error:', err)
  })
}

function scheduleCheckpoint(): void {
  if (!isMainWindow) return
  if (checkpointTimer !== null) window.clearTimeout(checkpointTimer)
  checkpointTimer = window.setTimeout(() => {
    checkpointTimer = null
    flushCheckpoint(false)
  }, CHECKPOINT_DEBOUNCE_MS)
}

/**
 * Restore a persisted snapshot: queue + active track reinstated, audio loaded
 * and seeked to the saved position, playback left PAUSED for safety. Clears
 * the SQLite checkpoint once consumed. Returns false for unusable snapshots
 * (parse failure / no playable tracks), which callers should treat as dismiss.
 */
export async function restoreCheckpoint(snapshotJson: string): Promise<boolean> {
  ensureWiring()
  let parsed: CheckpointSnapshot
  try {
    parsed = JSON.parse(snapshotJson) as CheckpointSnapshot
  } catch {
    return false
  }
  const tracks = Array.isArray(parsed.tracks)
    ? parsed.tracks.filter((t) => t && typeof t.path === 'string' && t.path.length > 0)
    : []
  if (tracks.length === 0) {
    await discardCheckpoint()
    return false
  }
  const activeIndex = Math.min(Math.max(0, Math.floor(parsed.activeIndex ?? 0)), tracks.length - 1)
  const withFreshIds = tracks.map((t) => ({ ...t, queueId: nextQueueId() }))
  const repeatMode: PlaybackMode =
    parsed.repeatMode === 'repeat-all' || parsed.repeatMode === 'repeat-one' || parsed.repeatMode === 'normal'
      ? parsed.repeatMode
      : 'normal'
  const track = withFreshIds[activeIndex]

  set({
    queue: withFreshIds,
    priorityQueue: [],
    index: activeIndex,
    currentTrack: track,
    currentTime: 0,
    duration: track.duration_secs ?? null,
    currentLyrics: [],
    playbackError: null,
    mode: parsed.isShuffle ? 'shuffle' : repeatMode,
    // Preserve the displaced live queue so the replacement is one-click
    // reversible (sessions "Replace Queue" undo). An empty pre-state has
    // nothing worth restoring, so it resets to null.
    previousQueueSnapshot:
      snapshot.queue.length > 0
        ? {
            tracks: snapshot.queue.map((t) => ({ ...t, queueId: undefined })),
            activeIndex: snapshot.index,
            positionMs: Math.max(0, Math.round(snapshot.currentTime * 1000))
          }
        : null
  })
  resetFailures()
  audioController.load(toAudioUrl(track.path))
  const positionSecs = Math.max(0, (parsed.positionMs ?? 0) / 1000)
  if (positionSecs > 0) {
    // Chromium applies this as the default playback start position even
    // before metadata arrives — restored sessions resume mid-track, paused.
    audioController.seek(positionSecs)
    set({ currentTime: positionSecs })
  }
  void loadLyricsForTrack(track)
  await discardCheckpoint()
  return true
}

/** Drop the persisted checkpoint (banner dismissed / expired). */
export async function discardCheckpoint(): Promise<void> {
  try {
    await invoke('clear_queue_checkpoint')
  } catch (err) {
    console.debug('[usePlayerStore] clear_queue_checkpoint error:', err)
  }
}

/**
 * One-click revert of the latest Replace Queue: reinstates the displaced
 * queue (fresh queue-slot ids), resumes PAUSED at the captured track and
 * position, and consumes the snapshot (undo is single-level by design).
 * No-op when nothing was displaced.
 */
export function restorePreviousQueue(): void {
  ensureWiring()
  const prev = snapshot.previousQueueSnapshot
  if (!prev || prev.tracks.length === 0) return
  const withFreshIds = prev.tracks.map((t) => ({ ...t, queueId: nextQueueId() }))
  const activeIndex = Math.min(Math.max(0, Math.floor(prev.activeIndex)), withFreshIds.length - 1)
  const track = withFreshIds[activeIndex]
  set({
    queue: withFreshIds,
    priorityQueue: [],
    index: activeIndex,
    currentTrack: track,
    currentTime: 0,
    duration: track.duration_secs ?? null,
    currentLyrics: [],
    playbackError: null,
    previousQueueSnapshot: null
  })
  resetFailures()
  audioController.load(toAudioUrl(track.path))
  const positionSecs = Math.max(0, (prev.positionMs ?? 0) / 1000)
  if (positionSecs > 0) {
    audioController.seek(positionSecs)
    set({ currentTime: positionSecs })
  }
  void loadLyricsForTrack(track)
}

/**
 * Serialize playback state for saving as a named session. Same payload shape
 * as the queue checkpoint (Feature 3 contract). Pass `only` to save a SELECTED
 * SUBSET of the queue (selective session save): the snapshot then contains just
 * those tracks, with activeIndex pointing at the currently playing track when
 * it survived the selection (else the first track).
 */
export function exportQueueSnapshot(only?: PlayerTrack[]): {
  snapshotJson: string
  trackCount: number
  durationSecs: number
} {
  const base = buildCheckpointSnapshot()
  const tracks = only ? only.map((t) => ({ ...t, queueId: undefined })) : base.tracks
  const activeIndex = only
    ? only.findIndex((t) => t.id === snapshot.currentTrack?.id) >= 0
      ? only.findIndex((t) => t.id === snapshot.currentTrack?.id)
      : 0
    : base.activeIndex
  const snap: CheckpointSnapshot = only ? { ...base, tracks, activeIndex } : base
  const durationSecs = tracks.reduce(
    (sum, t) => sum + (t.duration_secs && t.duration_secs > 0 ? t.duration_secs : 0),
    0
  )
  return { snapshotJson: JSON.stringify(snap), trackCount: tracks.length, durationSecs }
}

/**
 * Play a track that belongs to a saved session from inside the sessions
 * popover. When the track already exists in the context queue (matched by
 * library id, then by path) playback switches to that row; otherwise the
 * track is appended to the END of the queue first (non-destructive — the
 * existing queue is never replaced) and the new row starts playing. Returns
 * the played row's queue-slot id (`queueItemId`) so the caller can scroll the
 * queue list to it, or null when the track was unusable.
 */
export function playTrackFromSession(track: PlayerTrack): string | null {
  ensureWiring()
  if (!track || typeof track.path !== 'string' || track.path.length === 0) return null
  const queue = snapshot.queue
  let idx = queue.findIndex((t) => t.id === track.id)
  if (idx < 0) idx = queue.findIndex((t) => t.path === track.path)
  if (idx < 0) {
    appendTracksToQueue([track])
    const appended = snapshot.queue
    idx = appended.findIndex((t) => t.id === track.id)
    if (idx < 0) idx = appended.length - 1
    if (idx < 0) return null
  }
  void playTrackAt(idx)
  return queueItemId(snapshot.queue[idx])
}

/**
 * Append whole tracks to the END of the context queue (named-session
 * "Add to Queue"). Existing rows, playback state and the priority tier are
 * untouched; the structural `set` schedules the debounced checkpoint. Rows
 * without a readable path are dropped defensively, and fresh queue-slot ids
 * are minted so appended duplicates never collide with existing rows.
 */
export function appendTracksToQueue(tracks: PlayerTrack[]): void {
  ensureWiring()
  const playable = (Array.isArray(tracks) ? tracks : []).filter(
    (t) => t && typeof t.path === 'string' && t.path.length > 0
  )
  if (playable.length === 0) return
  const withFreshIds = playable.map((t) => ({ ...t, queueId: nextQueueId() }))
  set({ queue: [...snapshot.queue, ...withFreshIds] })
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
    // Immediate (non-debounced) flush: pause is a coarse checkpoint point, and
    // WebView2 can terminate the process before any beforeunload IPC lands —
    // the last paused state must already be in SQLite. flushCheckpoint cancels
    // any pending debounced write, so nothing double-fires.
    if (!unloading) flushCheckpoint(false)
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

/**
 * Remove ONE context-queue row by its queue-slot id (`queueItemId`), capturing
 * an undo snapshot of both tiers + playhead + position beforehand. Returns the
 * snapshot for the caller's toast, or null when the id belongs to no row.
 *
 * Active-row handling: if the removed row IS the live audio (context playhead,
 * not a priority-tier takeover), playback advances cleanly to the row that
 * took its slot — playing on if it was playing, loading paused otherwise. An
 * emptied context stops outright. The priority tier is never touched.
 */
export function removeQueuedRow(queueId: string): QueueUndoSnapshot | null {
  ensureWiring()
  const at = snapshot.queue.findIndex((t) => queueItemId(t) === queueId)
  if (at < 0) return null
  const undoSnapshot = captureQueueUndoSnapshot()
  const next = snapshot.queue.filter((_, i) => i !== at)

  const isActiveRow =
    at === snapshot.index && snapshot.currentTrack?.path === snapshot.queue[at]?.path
  if (!isActiveRow) {
    // Playback untouched; the playhead only slides when the removal happened
    // BEFORE it in the list.
    set({ queue: next, index: at < snapshot.index ? snapshot.index - 1 : snapshot.index })
    return undoSnapshot
  }

  finishActiveSession('skip')
  if (next.length === 0) {
    try {
      audioController.pause()
      audioController.seek(0)
    } catch (err) {
      console.debug('[AudioController pause error]:', err)
    }
    set({
      queue: [],
      index: -1,
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: null,
      playbackError: null,
      currentLyrics: []
    })
    return undoSnapshot
  }

  const nextIndex = Math.min(at, next.length - 1)
  if (snapshot.isPlaying) {
    set({ queue: next })
    void startAt(nextIndex)
  } else {
    // Paused: swap the loaded audio to the neighbor WITHOUT playing it.
    const track = next[nextIndex]
    set({
      queue: next,
      index: nextIndex,
      currentTrack: track,
      currentTime: 0,
      duration: track.duration_secs ?? null,
      currentLyrics: []
    })
    audioController.load(toAudioUrl(track.path))
  }
  return undoSnapshot
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
    currentLyrics: [],
    // An intentionally emptied queue has nothing to revert to.
    previousQueueSnapshot: null
  })
}

/**
 * Undoable clear: captures both tiers + playhead + position, then performs the
 * normal destructive `clearQueue()`. Returns the snapshot for the caller's
 * UndoToast, or null when there was nothing to clear (no toast then).
 */
export function clearQueueWithUndo(): QueueUndoSnapshot | null {
  ensureWiring()
  if (snapshot.queue.length === 0 && snapshot.priorityQueue.length === 0) return null
  const undoSnapshot = captureQueueUndoSnapshot()
  clearQueue()
  return undoSnapshot
}

/**
 * One-click restore of a destructive-action snapshot (remove row / clear
 * queue): reinstates both tiers and the playhead. When the snapshot's active
 * track is STILL the live audio (undoing a non-active row removal mid-playback)
 * the audio element is untouched — no reload, no seek, no glitch. Otherwise the
 * captured track is loaded PAUSED at the captured position (the same
 * safety-first convention as restoreCheckpoint / restorePreviousQueue).
 */
export function restoreQueueSnapshot(s: QueueUndoSnapshot): void {
  ensureWiring()
  const tracks = s.tracks.map((t) => ({ ...t }))
  const priority = s.priorityQueue.map((t) => ({ ...t }))
  if (tracks.length === 0) {
    // Context list was empty pre-action: only the priority tier comes back.
    set({ queue: [], priorityQueue: priority, index: -1 })
    return
  }
  const activeIndex = Math.min(Math.max(0, Math.floor(s.activeIndex)), tracks.length - 1)
  const activeTrack = tracks[activeIndex] ?? null
  const sameAudio =
    !!activeTrack && !!snapshot.currentTrack && activeTrack.path === snapshot.currentTrack.path
  if (sameAudio) {
    set({ queue: tracks, priorityQueue: priority, index: activeIndex })
    return
  }
  const positionSecs = Math.max(0, (s.positionMs ?? 0) / 1000)
  set({
    queue: tracks,
    priorityQueue: priority,
    index: activeIndex,
    currentTrack: activeTrack,
    currentTime: positionSecs,
    duration: activeTrack?.duration_secs ?? null,
    currentLyrics: [],
    isPlaying: false,
    playbackError: null
  })
  resetFailures()
  if (activeTrack) {
    audioController.load(toAudioUrl(activeTrack.path))
    if (positionSecs > 0) {
      audioController.seek(positionSecs)
      set({ currentTime: positionSecs })
    }
  }
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
  removeQueuedRow,
  clearQueueWithUndo,
  restoreQueueSnapshot,
  reorderQueue,
  setQueueOrder,
  appendTracksToQueue,
  playTrackFromSession,
  restorePreviousQueue,
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

