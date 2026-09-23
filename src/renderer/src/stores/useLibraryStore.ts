import { create } from 'zustand'
import type { ScanProgress, TrackListItem } from '../types/nocturne'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

interface LibraryState {
  tracks: TrackListItem[]
  total: number
  status: ScanStatus
  progress: { scanned: number; total: number; skipped: number }
  search: string
  error: string | null
  setSearch: (query: string) => void
  setProgress: (p: ScanProgress) => void
  refresh: () => Promise<void>
  addFolderAndScan: () => Promise<void>
  cancelScan: () => Promise<void>
}

async function loadTracks(search: string): Promise<{ tracks: TrackListItem[]; total: number }> {
  return window.nocturne.tracks.list({ search, sortBy: 'dateAdded', sortDir: 'desc', limit: 200, offset: 0 })
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  tracks: [],
  total: 0,
  status: 'idle',
  progress: { scanned: 0, total: 0, skipped: 0 },
  search: '',
  error: null,

  setSearch: (query: string): void => {
    set({ search: query })
    void get().refresh()
  },

  setProgress: (p: ScanProgress): void => {
    set({ progress: { scanned: p.scanned, total: p.total, skipped: p.skippedUnsupported } })
  },

  refresh: async (): Promise<void> => {
    try {
      const { tracks, total } = await loadTracks(get().search)
      set((s) => ({ tracks, total, error: null, status: s.status === 'scanning' ? 'scanning' : s.status }))
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Failed to load tracks' })
    }
  },

  addFolderAndScan: async (): Promise<void> => {
    if (get().status === 'scanning') return
    try {
      const picked = await window.nocturne.library.selectFolder()
      if (picked.canceled || !picked.folderPath) return
      set({ status: 'scanning', error: null, progress: { scanned: 0, total: 0, skipped: 0 } })
      await window.nocturne.library.scan([picked.folderPath])
      await get().refresh()
      set({ status: 'done' })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Scan failed' })
    }
  },

  cancelScan: async (): Promise<void> => {
    try {
      await window.nocturne.library.cancelScan()
    } catch {
      // Scan may have already finished; refresh anyway.
    }
    await get().refresh()
    set({ status: 'done' })
  }
}))
