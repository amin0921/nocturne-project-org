import { useSyncExternalStore } from 'react'
import { audioController } from '../services/audio-controller'
import { usePlayerStore } from './usePlayerStore'

/**
 * Sleep timer — vanilla store + non-React fade engine.
 *
 * The engine runs OUTSIDE React: the 1 Hz countdown display lives entirely in
 * CountdownPill (its own local interval), and the fade ramp paints
 * `el.volume` directly, so starting/running the timer never re-renders the
 * PlayerBar tree. The user's master volume (store `volume`, DetentKnob) is
 * NEVER written during the ramp — only the audio element's volume is faded,
 * and the store level is restored to the element on completion/cancel.
 */

export type SleepTimerMode = 'inactive' | 'timed' | 'end-of-track' | 'end-of-queue'

export interface SleepTimerSnapshot {
  mode: SleepTimerMode
  /** Epoch ms at which the fade completes (timed mode only). */
  endAt: number | null
  /** Preset minutes of the active timed run (chip highlight only). */
  minutes: number | null
  fading: boolean
}

export const SLEEP_FADE_SECONDS = 30
export const SLEEP_MIN_MINUTES = 1
export const SLEEP_MAX_MINUTES = 180

const ENGINE_TICK_MS = 250

let snapshot: SleepTimerSnapshot = {
  mode: 'inactive',
  endAt: null,
  minutes: null,
  fading: false
}

const listeners = new Set<() => void>()

function set(patch: Partial<SleepTimerSnapshot>): void {
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
export function useSleepTimer<T>(selector: (s: SleepTimerSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => selector(snapshot))
}

let engineTimer: number | null = null

function stopEngine(): void {
  if (engineTimer !== null) {
    window.clearInterval(engineTimer)
    engineTimer = null
  }
}

function startEngine(): void {
  if (engineTimer !== null) return
  engineTimer = window.setInterval(engineTick, ENGINE_TICK_MS)
}

function userVolume01(): number {
  const v = usePlayerStore.getState().volume
  return Math.min(100, Math.max(0, v)) / 100
}

/** Hand the element's volume back to the user's (unchanged) master level. */
function restoreUserVolume(): void {
  audioController.setVolume(userVolume01())
}

/**
 * The ramp targets the LIVE master volume each tick, so a mid-fade volume
 * change re-targets the fade instead of fighting it — while the store value
 * itself stays untouched.
 */
function applyFadeFactor(factor: number): void {
  const clamped = Math.min(1, Math.max(0, factor))
  audioController.setVolume(userVolume01() * clamped)
}

function engineTick(): void {
  if (snapshot.mode !== 'timed' || snapshot.endAt === null) {
    stopEngine()
    return
  }
  const remainingMs = snapshot.endAt - Date.now()
  if (remainingMs <= 0) {
    completeSleepTimer()
    return
  }
  const remainingSec = remainingMs / 1000
  if (remainingSec <= SLEEP_FADE_SECONDS) {
    if (!snapshot.fading) set({ fading: true })
    applyFadeFactor(remainingSec / SLEEP_FADE_SECONDS)
  }
}

/** Pause playback, restore the user's master volume and disarm the timer. */
function completeSleepTimer(): void {
  stopEngine()
  try {
    audioController.pause()
  } catch {
    // Already stopped — the volume restore below still runs.
  }
  restoreUserVolume()
  set({ mode: 'inactive', endAt: null, minutes: null, fading: false })
}

function disarmTrackBoundFade(): void {
  stopEngine()
  if (snapshot.fading) restoreUserVolume()
}

export function startSleepTimed(minutes: number): void {
  const m = Math.round(Math.min(SLEEP_MAX_MINUTES, Math.max(SLEEP_MIN_MINUTES, minutes)))
  disarmTrackBoundFade()
  set({ mode: 'timed', endAt: Date.now() + m * 60_000, minutes: m, fading: false })
  startEngine()
}

export function startSleepEndOfTrack(): void {
  disarmTrackBoundFade()
  set({ mode: 'end-of-track', endAt: null, minutes: null, fading: false })
}

export function startSleepEndOfQueue(): void {
  disarmTrackBoundFade()
  set({ mode: 'end-of-queue', endAt: null, minutes: null, fading: false })
}

export function cancelSleepTimer(): void {
  if (snapshot.mode === 'inactive') return
  disarmTrackBoundFade()
  set({ mode: 'inactive', endAt: null, minutes: null, fading: false })
}

/**
 * Fed from the audio clock (~4Hz). Drives the track-bound fades
 * (end-of-track / end-of-queue); the timed mode runs on its own wall-clock
 * engine and ignores this. A seek back out of the fade window hands the
 * volume back untouched.
 */
export function notifySleepProgress(currentTime: number, duration: number | null): void {
  if (snapshot.mode !== 'end-of-track' && snapshot.mode !== 'end-of-queue') return
  if (!duration || !Number.isFinite(duration) || duration <= 0) return
  if (!usePlayerStore.getState().isPlaying) return
  const remain = duration - currentTime
  const span = Math.min(SLEEP_FADE_SECONDS, duration)
  if (remain > span) {
    if (snapshot.fading) {
      set({ fading: false })
      restoreUserVolume()
    }
    return
  }
  if (!snapshot.fading) set({ fading: true })
  applyFadeFactor(remain / span)
}

/**
 * Called from the audio `ended` handler BEFORE any queue advancement.
 * Returns true when the sleep timer claims the stop (End of Track) and the
 * queue must not advance.
 */
export function handleSleepTrackEnded(): boolean {
  if (snapshot.mode !== 'end-of-track') return false
  completeSleepTimer()
  return true
}

/** Natural end-of-queue stop: last track finished, nothing left to advance to. */
export function notifySleepQueueEnd(): void {
  if (snapshot.mode !== 'end-of-queue') return
  completeSleepTimer()
}

/** Track-bound modes die with the queue (clearQueue); wall-clock timed runs on. */
export function cancelSleepIfTrackBound(): void {
  if (snapshot.mode === 'end-of-track' || snapshot.mode === 'end-of-queue') {
    cancelSleepTimer()
  }
}
