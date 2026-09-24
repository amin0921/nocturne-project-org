import { useSyncExternalStore } from 'react'

export type ViewMode = 'stage' | 'library' | 'stats'
export type RightPanelTab = 'queue' | 'history' | 'specs'

export interface UIState {
  view: ViewMode
  setView: (v: ViewMode) => void
  queueOpen: boolean
  setQueueOpen: (open: boolean) => void
  toggleQueue: () => void
  rightTab: RightPanelTab
  setRightTab: (tab: RightPanelTab) => void
  lyricsOpen: boolean
  setLyricsOpen: (open: boolean) => void
  toggleLyrics: () => void
}

const STORAGE_KEY = 'nocturne-ui'

function getInitialView(): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.view === 'stage' || parsed.view === 'library' || parsed.view === 'stats') {
        return parsed.view
      }
    }
  } catch {
    // fallback to stage
  }
  return 'stage'
}

let snapshot: { view: ViewMode; queueOpen: boolean; rightTab: RightPanelTab; lyricsOpen: boolean } = {
  view: getInitialView(),
  queueOpen: false,
  rightTab: 'queue',
  lyricsOpen: false
}

const listeners = new Set<() => void>()

function emitChange(): void {
  listeners.forEach((l) => l())
}

const actions = {
  setView: (view: ViewMode): void => {
    snapshot = { ...snapshot, view }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ view }))
    } catch {
      // ignore storage errors
    }
    emitChange()
  },
  setQueueOpen: (queueOpen: boolean): void => {
    snapshot = { ...snapshot, queueOpen }
    emitChange()
  },
  toggleQueue: (): void => {
    snapshot = { ...snapshot, queueOpen: !snapshot.queueOpen }
    emitChange()
  },
  setRightTab: (rightTab: RightPanelTab): void => {
    snapshot = { ...snapshot, rightTab }
    emitChange()
  },
  setLyricsOpen: (lyricsOpen: boolean): void => {
    snapshot = { ...snapshot, lyricsOpen }
    emitChange()
  },
  toggleLyrics: (): void => {
    snapshot = { ...snapshot, lyricsOpen: !snapshot.lyricsOpen }
    emitChange()
  }
}

function getFullState(): UIState {
  return {
    view: snapshot.view,
    queueOpen: snapshot.queueOpen,
    rightTab: snapshot.rightTab,
    lyricsOpen: snapshot.lyricsOpen,
    setView: actions.setView,
    setQueueOpen: actions.setQueueOpen,
    toggleQueue: actions.toggleQueue,
    setRightTab: actions.setRightTab,
    setLyricsOpen: actions.setLyricsOpen,
    toggleLyrics: actions.toggleLyrics
  }
}

export function useUIStore<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => selector(getFullState())
  )
}

useUIStore.getState = getFullState
