import { useCallback, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'

export const LYRIC_OFFSET_MIN_MS = -5000
export const LYRIC_OFFSET_MAX_MS = 5000
export const LYRIC_OFFSET_NUDGE_MS = 500

interface OffsetEntry {
  valueMs: number
  hydrated: boolean
  loading: boolean
  dirty: boolean
}

const entries = new Map<string, OffsetEntry>()
const listeners = new Map<string, Set<() => void>>()

function clampMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(LYRIC_OFFSET_MIN_MS, Math.min(LYRIC_OFFSET_MAX_MS, Math.round(value)))
}

function ensureEntry(key: string): OffsetEntry {
  let entry = entries.get(key)
  if (!entry) {
    entry = { valueMs: 0, hydrated: false, loading: false, dirty: false }
    entries.set(key, entry)
  }
  return entry
}

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener())
}

function hydrate(key: string): void {
  const entry = entries.get(key)
  if (!entry || entry.hydrated || entry.loading) return
  entry.loading = true
  invoke<number>('get_lyric_offset', { trackId: key })
    .then((stored) => {
      entry.loading = false
      entry.hydrated = true
      if (!entry.dirty && Number.isFinite(stored)) {
        entry.valueMs = clampMs(stored)
      }
      notify(key)
    })
    .catch((err) => {
      entry.loading = false
      console.debug('get_lyric_offset error:', err)
      notify(key)
    })
}

function commit(key: string, raw: number): void {
  if (!key) return
  const entry = ensureEntry(key)
  entry.valueMs = clampMs(raw)
  entry.dirty = true
  entry.hydrated = true
  notify(key)
  invoke('set_lyric_offset', { trackId: key, offsetMs: entry.valueMs }).catch((err) =>
    console.debug('set_lyric_offset error:', err)
  )
}

export interface LyricOffsetController {
  offsetMs: number
  nudge: (deltaMs: number) => void
  setOffsetMs: (nextMs: number) => void
}

export function useLyricOffset(trackKey: string | null | undefined): LyricOffsetController {
  const key = trackKey ?? ''

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {}
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(listener)
      hydrate(key)
      return () => {
        const current = listeners.get(key)
        if (!current) return
        current.delete(listener)
        if (current.size === 0) listeners.delete(key)
      }
    },
    [key]
  )

  const getSnapshot = useCallback(() => (key ? entries.get(key)?.valueMs ?? 0 : 0), [key])

  const offsetMs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setOffsetMs = useCallback((nextMs: number) => commit(key, nextMs), [key])

  const nudge = useCallback(
    (deltaMs: number) => commit(key, (entries.get(key)?.valueMs ?? 0) + deltaMs),
    [key]
  )

  return { offsetMs, nudge, setOffsetMs }
}

export default useLyricOffset
