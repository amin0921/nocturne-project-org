import { create } from 'zustand'
import { audioController } from '../services/audio-controller'
import { toSafeFileUrl } from '../utils/safe-file'
import type { TrackListItem } from '../types/nocturne'
import { useLibraryStore } from './useLibraryStore'

export type PlaybackMode = 'normal' | 'shuffle' | 'repeat-all' | 'repeat-one'

interface PlayerState {
  queue: TrackListItem[]
  index: number
  currentTrack: TrackListItem | null
  isPlaying: boolean
  currentTime: number
  duration: number | null
  volume: number
  isMuted: boolean
  mode: PlaybackMode
  playTracks: (tracks: TrackListItem[], startIndex: number) => Promise<void>
  togglePlay: () => Promise<void>
  next: (auto?: boolean) => Promise<void>
  prev: () => Promise<void>
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleRepeat: () => void
  toggleShuffle: () => void
}

let wired = false

function pickRandomIndex(length: number, exclude: number): number {
  if (length <= 1) return 0
  let next = exclude
  while (next === exclude) next = Math.floor(Math.random() * length)
  return next
}

async function startAt(index: number): Promise<void> {
  const { queue } = usePlayerStore.getState()
  const track = queue[index] ?? null
  if (!track) return
  usePlayerStore.setState({ index, currentTrack: track, currentTime: 0, duration: track.durationSec })
  audioController.load(toSafeFileUrl(track.filePath))
  try {
    await audioController.play()
    usePlayerStore.setState({ isPlaying: true })
  } catch (err) {
    // AbortError on rapid track switches is normal; real failures skip forward.
    if (err instanceof DOMException && err.name === 'AbortError') return
    console.error('[nocturne] play failed, skipping', err)
    void usePlayerStore.getState().next(true)
  }
}

function ensureWiring(): void {
  if (wired) return
  wired = true
  const el = audioController.element
  el.addEventListener('loadedmetadata', () => {
    usePlayerStore.setState({ duration: Number.isFinite(el.duration) ? el.duration : null })
  })
  el.addEventListener('play', () => usePlayerStore.setState({ isPlaying: true }))
  el.addEventListener('pause', () => usePlayerStore.setState({ isPlaying: false }))
  el.addEventListener('error', () => {
    console.error('[nocturne] audio error, skipping')
    void usePlayerStore.getState().next(true)
  })
  el.addEventListener('ended', () => {
    const { mode, queue, index } = usePlayerStore.getState()
    if (mode === 'repeat-one') {
      audioController.seek(0)
      void audioController.play().catch(() => undefined)
      return
    }
    if (mode === 'shuffle') {
      void startAt(pickRandomIndex(queue.length, index))
      return
    }
    if (mode === 'repeat-all') {
      void startAt(queue.length === 0 ? 0 : (index + 1) % queue.length)
      return
    }
    if (index + 1 < queue.length) {
      void startAt(index + 1)
    } else {
      usePlayerStore.setState({ isPlaying: false })
    }
  })
  audioController.onTime(() => {
    usePlayerStore.setState({ currentTime: audioController.getTime() })
  })
}

export const usePlayerStore = create<PlayerState>()((set, get) => {
  ensureWiring()
  audioController.setVolume(0.8)
  return {
    queue: [],
    index: -1,
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: null,
    volume: 80,
    isMuted: false,
    mode: 'normal',

    playTracks: async (tracks, startIndex) => {
      if (tracks.length === 0) return
      set({ queue: tracks, index: Math.min(Math.max(0, startIndex), tracks.length - 1) })
      await startAt(get().index)
    },

    togglePlay: async () => {
      const { currentTrack, isPlaying } = get()
      if (!currentTrack) {
        const libTracks = useLibraryStore.getState().tracks.filter((t) => t.missing !== 1)
        if (libTracks.length > 0) await get().playTracks(libTracks, 0)
        return
      }
      if (isPlaying) {
        audioController.pause()
      } else {
        // Resume after queue refresh (e.g. rescan) keeps working: reload if src lost.
        if (!audioController.element.currentSrc) {
          audioController.load(toSafeFileUrl(currentTrack.filePath))
        }
        try {
          await audioController.play()
        } catch {
          // Play blocked (e.g. no gesture yet) — stay paused.
        }
      }
    },

    next: async (auto = false) => {
      const { queue, index, mode } = get()
      if (queue.length === 0) return
      if (auto && mode === 'normal' && index + 1 >= queue.length) return
      await startAt(mode === 'shuffle' && !auto ? pickRandomIndex(queue.length, index) : (index + 1) % queue.length)
    },

    prev: async () => {
      const { queue, index } = get()
      if (queue.length === 0) return
      if (audioController.getTime() > 3) {
        get().seek(0)
        return
      }
      await startAt((index - 1 + queue.length) % queue.length)
    },

    seek: (seconds) => {
      audioController.seek(seconds)
      set({ currentTime: audioController.getTime() })
    },

    setVolume: (volume) => {
      const v = Math.min(100, Math.max(0, Math.round(volume)))
      audioController.setVolume(v / 100)
      set({ volume: v })
      if (v > 0 && get().isMuted) {
        audioController.setMuted(false)
        set({ isMuted: false })
      }
    },

    toggleMute: () => {
      const muted = !get().isMuted
      audioController.setMuted(muted)
      set({ isMuted: muted })
    },

    cycleRepeat: () => {
      const order: PlaybackMode[] = ['normal', 'repeat-all', 'repeat-one']
      const nextMode = order[(order.indexOf(get().mode === 'shuffle' ? 'normal' : get().mode) + 1) % order.length] as PlaybackMode
      set({ mode: nextMode })
    },

    toggleShuffle: () => {
      set({ mode: get().mode === 'shuffle' ? 'normal' : 'shuffle' })
    }
  }
})
