import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalPosition, PhysicalPosition } from '@tauri-apps/api/dpi'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { Copy, Disc3, FileAudio, Minus, Play, Square, Trash2, X } from 'lucide-react'
import CoverFlowView from './components/CoverFlowView'
import { CinemaStage } from './components/cinema'
import PlayerBar from './components/PlayerBar'
import MicroDock from './components/MicroDock'
import CenterIsland from './components/CenterIsland'
import QueuePanel from './components/QueuePanel'
import QueueSheet from './components/QueueSheet'
import EqBars from './components/EqBars'
import ErrorBoundary from './components/ErrorBoundary'
import { AlertDialog } from './components/ui/alert-dialog'
import { ContextMenu, type ContextMenuItem } from './components/ui/context-menu'
import { DataTable, type DataColumn } from './components/ui/data-table'
import { SearchInput } from './components/ui/search-input'
import { Spinner } from './components/ui/spinner'
import { Tooltip } from './components/ui/tooltip'
import { DOCK_ITEMS, type DockItem } from './config/dock'
import { useUIStore } from './stores/useUIStore'
import { resolveCoverUrl } from './utils/cover-url'
import {
  clearQueue,
  cycleRepeat,
  initPlayer,
  next,
  playTrackAt,
  prev,
  setQueue,
  toggleMute,
  togglePlay,
  toggleShuffle,
  usePlayerStore,
  type PlayerTrack
} from './stores/usePlayerStore'
import { CommandPalette } from './components/command-palette'
import { cn, formatTime } from './lib/utils'
import { useStudioHotkeys } from './hooks/useStudioHotkeys'
import {
  MINI_PINNED_STORAGE_KEY,
  MINI_POSITION_STORAGE_KEY
} from './services/player-broadcast'

function TableTrackThumbnail({ coverUrl, title }: { coverUrl?: string | null; title?: string }) {
  const [imgError, setImgError] = useState(false)
  const resolved = !imgError ? resolveCoverUrl(coverUrl) : undefined

  return (
    <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#121419]">
      {resolved ? (
        <img
          src={resolved}
          alt={title ?? ''}
          draggable={false}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
          <Disc3 size={13} className="text-faint/60" />
        </div>
      )}
    </div>
  )
}

export default function App(): JSX.Element {
  const [tracks, setTracks] = useState<PlayerTrack[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ scanned: number; total: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; trackId: number } | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ id: number; title: string } | null>(null)
  const [isCoverViewOpen, setIsCoverViewOpen] = useState(false)
  const [dockExpanded, setDockExpanded] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteTab, setPaletteTab] = useState<'commands' | 'atlas'>('commands')

  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const cinemaOpen = useUIStore((s) => s.cinemaOpen)
  const setCinemaOpen = useUIStore((s) => s.setCinemaOpen)
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  useEffect(() => {
    let active = true
    const win = getCurrentWindow()
    win.isMaximized().then((max) => {
      if (active) setIsMaximized(max)
    }).catch(() => {})

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    // Strictly debounced resize listener (250ms): runs once after window settles
    const unlistenPromise = win.onResized(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!active) return
        win.isMaximized().then((max) => {
          if (active) setIsMaximized(max)
        }).catch(() => {})
      }, 250)
    })

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])

  // Step 79: floating mini-island visibility sync. Main minimized → show the
  // mini pill (unless pinned flag disabled); restored/focused → hide it.
  // Detection: isMinimized + onFocusChanged + debounced onResized (150ms).
  useEffect(() => {
    let active = true
    const win = getCurrentWindow()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const isPinned = (): boolean => {
      try {
        return localStorage.getItem(MINI_PINNED_STORAGE_KEY) !== 'false'
      } catch {
        return true
      }
    }

    const readStoredPosition = (): { x: number; y: number } | null => {
      try {
        const raw = localStorage.getItem(MINI_POSITION_STORAGE_KEY)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          typeof (parsed as { x?: unknown }).x === 'number' &&
          typeof (parsed as { y?: unknown }).y === 'number'
        ) {
          const pos = parsed as { x: number; y: number }
          return { x: pos.x, y: pos.y }
        }
      } catch {
        // Malformed entry — fall through to default placement.
      }
      return null
    }

    const syncMiniIsland = async (): Promise<void> => {
      if (!active) return
      try {
        const minimized = await win.isMinimized()
        const mini = await WebviewWindow.getByLabel('mini-island')
        if (!active || !mini) return
        if (minimized && isPinned()) {
          // Reveal signal BEFORE programmatic positioning: arms the mini's
          // 600ms onMoved save-guard so this setPosition cannot overwrite the
          // stored user coordinate, and queues the liquid-droplet entrance.
          await emit('mini-island:reveal').catch(() => undefined)
          const stored = readStoredPosition()
          if (stored) {
            await mini.setPosition(new PhysicalPosition(stored.x, stored.y))
          } else {
            // DPI-aware top-center anchor. screen.width is CSS-pixel/DPI-unaware
            // and drifts under Windows display scaling — use the active window's
            // monitor geometry instead: physical width / scaleFactor = logical px.
            // x centers the 360px window; y docks 16px below the top edge.
            const monitor = await currentMonitor()
            const logicalWidth = monitor
              ? monitor.size.width / monitor.scaleFactor
              : window.screen.width
            const x = Math.max(0, Math.round((logicalWidth - 360) / 2))
            await mini.setPosition(new LogicalPosition(x, 16))
          }
          await mini.show()
          // focus:false at creation — claim focus on appearance so the mini's
          // Escape listener receives keydown without requiring a prior click.
          await mini.setFocus()
        } else {
          await mini.hide()
        }
      } catch (err) {
        console.debug('Mini-island visibility sync error:', err)
      }
    }

    void syncMiniIsland()

    const unlistenFocus = win.onFocusChanged(() => {
      void syncMiniIsland()
    })
    const unlistenResize = win.onResized(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void syncMiniIsland()
      }, 150)
    })

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      unlistenFocus.then((unlisten) => unlisten()).catch(() => {})
      unlistenResize.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])

  const reload = useCallback(async () => {
    try {
      const list = await invoke<PlayerTrack[]>('get_tracks')
      const safeList = Array.isArray(list) ? list : []
      setTracks(safeList)
      setQueue(safeList)
    } catch (err) {
      setNotice(`Could not load tracks: ${String(err)}`)
    }
  }, [])

  useEffect(() => {
    initPlayer()
    void reload()
  }, [reload])

  // Global keyboard shortcuts:
  // - Ctrl+K / Cmd+K: Toggle Command Palette
  // - / or ?: Open Shortcut Atlas (no Shift required; when not typing)
  // - Ctrl+1: Stage View
  // - Ctrl+2: Library View
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteTab('commands')
        setPaletteOpen((prev) => !prev)
        return
      }

      const el = document.activeElement
      const isTyping =
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          (el instanceof HTMLElement && el.isContentEditable))

      if (
        !isTyping &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === '?' || e.key === '/')
      ) {
        e.preventDefault()
        setPaletteTab('atlas')
        setPaletteOpen(true)
        return
      }

      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        setView('stage')
      } else if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        setView('library')
      } else if (e.ctrlKey && e.key === '3') {
        e.preventDefault()
        setView('stats')
      }

      // Cinema Stage hotkey: Shift+F, Ctrl+Shift+F, or F (when not typing)
      if (
        !isTyping &&
        (
          ((e.shiftKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) ||
          (e.key === 'f' || e.key === 'F')
        )
      ) {
        if (!e.altKey && !e.metaKey) {
          e.preventDefault()
          setCinemaOpen(true)
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setView, setCinemaOpen])

  const handleRunCommand = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case 'toggle-play':
          togglePlay()
          break
        case 'next-track':
          void next()
          break
        case 'prev-track':
          void prev()
          break
        case 'toggle-mute':
          toggleMute()
          break
        case 'toggle-shuffle':
          toggleShuffle()
          break
        case 'cycle-repeat':
          cycleRepeat()
          break
        case 'go-stage':
          setView('stage')
          break
        case 'go-library':
          setView('library')
          break
        case 'go-stats':
          setView('stats')
          break
        case 'focus-search':
          setView('library')
          setTimeout(() => {
            const searchInput = document.querySelector<HTMLInputElement>(
              'input[aria-label="Search library"]'
            )
            searchInput?.focus()
            searchInput?.select()
          }, 60)
          break
        case 'toggle-lyrics':
          useUIStore.getState().toggleLyrics()
          break
        case 'open-coverflow':
          setIsCoverViewOpen(true)
          break
        case 'open-cinema':
          setCinemaOpen(true)
          break
        case 'toggle-miniplayer':
          try {
            const win = getCurrentWindow()
            void win.minimize()
          } catch (err) {
            console.debug('Window minimize error:', err)
          }
          break
        case 'open-atlas':
          setPaletteTab('atlas')
          setPaletteOpen(true)
          break
      }
    },
    [setView]
  )

  // Studio transport hotkeys: Space / Arrow±5s / L (lyrics) / M (mute),
  // with a typing-focus guard so the library search field stays untouched.
  useStudioHotkeys()

  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!Array.isArray(tracks)) return []
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter((t) => {
      if (!t) return false
      const title = String(t.title ?? '').toLowerCase()
      const artist = String(t.artist ?? '').toLowerCase()
      const album = String(t.album ?? '').toLowerCase()
      return title.includes(q) || artist.includes(q) || album.includes(q)
    })
  }, [tracks, query])

  const countText = useMemo(() => {
    const total = Array.isArray(tracks) ? tracks.length : 0
    const filteredCount = Array.isArray(filtered) ? filtered.length : 0
    const q = (query ?? '').trim()
    if (q && filteredCount !== total) {
      return `${filteredCount} / ${total} tracks`
    }
    return `${total} track${total === 1 ? '' : 's'}`
  }, [tracks, filtered, query])

  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setNotice('Path copied to clipboard')
    } catch {
      setNotice('Could not copy path')
    }
  }, [])

  const columns: DataColumn<PlayerTrack>[] = [
    {
      key: 'index',
      header: '#',
      headerClassName: 'w-12',
      cellClassName: 'w-12',
      render: (track, index) => {
        if (track && track.id === currentTrackId) {
          return <EqBars isPlaying={isPlaying} />
        }
        return <span className="text-xs tabular-nums text-faint numeric">{index + 1}</span>
      }
    },
    {
      key: 'title',
      header: 'Title',
      render: (track) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <TableTrackThumbnail coverUrl={track?.coverUrl} title={track?.title} />
          <span
            dir="auto"
            className={cn(
              'block truncate text-sm font-medium',
              track?.id === currentTrackId ? 'text-ember' : 'text-ink'
            )}
          >
            {track?.title ?? 'Unknown Title'}
          </span>
        </div>
      )
    },
    {
      key: 'artist-album',
      header: 'Artist & Album',
      render: (track) => (
        <span dir="auto" className="block truncate text-xs text-muted">
          {track?.artist ?? 'Unknown Artist'}{track?.album ? ` • ${track.album}` : ''}
        </span>
      )
    },
    {
      key: 'duration',
      header: 'Duration',
      headerClassName: 'w-24 text-right',
      cellClassName: 'w-24',
      render: (track) => (
        <span className="flex items-center justify-end gap-2">
          {track?.missing === 1 && (
            <span className="shrink-0 rounded-full border border-linestrong px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint">
              missing
            </span>
          )}
          <span className="numeric text-xs tabular-nums text-faint">
            {formatTime(track?.duration_secs)}
          </span>
        </span>
      )
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'w-14',
      cellClassName: 'w-14',
      render: (track) => {
        if (!track) return null
        return (
          <Tooltip content="Remove from library" side="left">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPendingRemove({ id: track.id, title: track.title ?? 'Track' })
              }}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`Remove ${track.title ?? 'track'} from library`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-faint opacity-0 hover:bg-line hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </Tooltip>
        )
      }
    }
  ]

  const addFolder = useCallback(async () => {
    try {
      // 1. Guard dialog: Open native folder picker WITHOUT mutating UI state or showing loading
      const selected = await invoke<string | null>('pick_folder')
      if (!selected) {
        // User cancelled dialog — zero state mutations, zero queries, zero loading indicators
        return
      }

      // 2. Folder confirmed: activate scanning state and live feedback
      setScanning(true)
      setNotice('Scanning audio files...')
      setScanProgress(null)

      const unlisten = await listen<{ scanned: number; total: number }>('scan-progress', (event) => {
        setScanProgress(event.payload)
        if (event.payload && event.payload.total > 0) {
          setNotice(`Scanning audio files (${event.payload.scanned} of ${event.payload.total})...`)
        }
      })

      try {
        const count = await invoke<number>('scan_folder', { path: selected })
        if (count > 0) {
          setNotice(`Scan complete: ${count} track${count === 1 ? '' : 's'} imported`)
        } else {
          setNotice('Scan complete: No new audio tracks found')
        }
        await reload()
      } finally {
        unlisten()
        setScanning(false)
        setScanProgress(null)
      }
    } catch (err) {
      console.error('[Scan error]:', err)
      setNotice(`Scan failed: ${String(err)}`)
      setScanning(false)
      setScanProgress(null)
    }
  }, [reload])

  const scanLabel = useMemo(() => {
    if (scanProgress && scanProgress.total > 0) {
      return `Scanning (${scanProgress.scanned}/${scanProgress.total})`
    }
    return 'Scanning…'
  }, [scanProgress])

  // "Add Files": native multi-select file dialog (not a folder picker), so every
  // audio track is visible in Explorer with name/size before selection. Backend
  // picks the dialog (`pick_audio_files`) and indexes the paths (`import_audio_files`).
  const addFiles = useCallback(async () => {
    try {
      // 1. Guard dialog: no UI state mutations until files are actually chosen
      const selected = await invoke<string[] | null>('pick_audio_files')
      if (!selected || selected.length === 0) {
        // User cancelled dialog — zero state mutations, zero queries
        return
      }

      // 2. Files confirmed: show busy feedback while metadata is read + stored
      setScanning(true)
      setScanProgress(null)
      setNotice(
        `Importing ${selected.length} selected file${selected.length === 1 ? '' : 's'}...`
      )

      const count = await invoke<number>('import_audio_files', { filePaths: selected })
      if (count > 0) {
        setNotice(`Imported ${count} track${count === 1 ? '' : 's'}`)
      } else {
        setNotice('No new audio tracks imported')
      }
      await reload()
    } catch (err) {
      console.error('[Import files error]:', err)
      setNotice(`Import failed: ${String(err)}`)
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }, [reload])

  const removeTrack = useCallback(
    async (id: number) => {
      const previous = tracks
      setTracks((current) => current.filter((t) => t.id !== id))
      try {
        await invoke('delete_track', { trackId: id })
      } catch (err) {
        setTracks(previous)
        setNotice(`Could not remove track: ${String(err)}`)
      }
    },
    [tracks]
  )

  const clearLibrary = useCallback(async () => {
    if (tracks.length === 0) return
    try {
      const removed = await invoke<number>('clear_library')
      setTracks([])
      clearQueue()
      setNotice(removed > 0 ? 'Library cleared' : 'Library is already empty')
    } catch (err) {
      setNotice(`Could not clear library: ${String(err)}`)
      await reload()
    } finally {
      setClearConfirmOpen(false)
    }
  }, [tracks.length, reload])

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize()
    } catch (err) {
      console.debug('Window minimize error:', err)
    }
  }, [])

  const handleToggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow()
      await win.toggleMaximize()
      const max = await win.isMaximized()
      setIsMaximized(max)
    } catch (err) {
      console.debug('Window toggleMaximize error:', err)
    }
  }, [])

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close()
    } catch (err) {
      console.error('Window close error:', err)
    }
  }, [])

  const handleDockSelect = useCallback(
    (item: DockItem) => {
      if (!item) return
      if (item.action === 'stage' || item.id === 'stage') {
        setView('stage')
      } else if (item.action === 'library' || item.id === 'library') {
        setView('library')
      } else if (item.action === 'cover-view' || item.id === 'cover') {
        setIsCoverViewOpen(true)
      } else if (item.action === 'add-folder' || item.id === 'add-folder') {
        void addFolder()
      }
    },
    [addFolder, setView]
  )

  const libraryContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-10 flex items-center gap-3 border-b border-white/5 px-5 py-2.5 pointer-events-auto">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search title, artist, album…"
          ariaLabel="Search library"
          className="max-w-md flex-1"
        />
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-faint numeric">
          {scanning ? 'Scanning…' : countText}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setClearConfirmOpen(true)}
            disabled={scanning}
            className="flex h-8 items-center rounded-lg px-3 text-xs font-medium text-faint hover:bg-raised/80 hover:text-ink disabled:opacity-50 transition-colors"
          >
            Clear Library
          </button>
          <button
            type="button"
            onClick={() => void addFolder()}
            disabled={scanning}
            className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-raised/80 px-3 text-xs font-medium text-ink hover:bg-line disabled:opacity-50 transition-colors"
          >
            {scanning && <Spinner size="xs" />}
            <span>{scanning ? scanLabel : 'Add Folder'}</span>
          </button>
          <button
            type="button"
            onClick={() => void addFiles()}
            disabled={scanning}
            title="Select audio files directly"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-raised/80 px-3 text-xs font-medium text-ink hover:bg-line disabled:opacity-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
          >
            <FileAudio size={14} className="text-amber-400" aria-hidden />
            <span>Add Files</span>
          </button>
        </div>
      </div>

      {notice && (
        <p className="border-b border-white/5 px-5 py-1 text-xs text-faint bg-surface/30" role="status">
          {notice}
        </p>
      )}

      {filtered.length === 0 && !scanning ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-ink">
            {tracks.length === 0 ? 'No tracks in library' : `No tracks match “${query.trim()}”`}
          </p>
          <p className="text-xs text-faint">
            {tracks.length === 0
              ? 'Add a music folder to start listening.'
              : 'Try a different title, artist, or album — or clear the search.'}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(track, index) => track?.id ?? index}
          ariaLabel="Tracks"
          loading={scanning}
          loadingRowCount={6}
          onRowClick={(track) => {
            if (track && track.missing !== 1) {
              const targetIndex = tracks.findIndex((item) => item.id === track.id)
              if (targetIndex >= 0) {
                setQueue(tracks, targetIndex)
                void playTrackAt(targetIndex)
              }
            }
          }}
          isRowActive={(track) => Boolean(track && track.id === currentTrackId)}
          isRowDisabled={(track) => Boolean(track && track.missing === 1)}
          disabledTitle="File missing — moved or deleted"
          onRowContextMenu={(track, _index, event) => {
            if (track) {
              setMenu({ x: event.clientX, y: event.clientY, trackId: track.id })
            }
          }}
        />
      )}
    </div>
  )

  const activeTrackIndex = useMemo(() => {
    if (tracks.length === 0) return 0
    const idx = tracks.findIndex((t) => t.id === currentTrackId)
    return idx >= 0 ? idx : 0
  }, [tracks, currentTrackId])

  return (
    <ErrorBoundary fallbackTitle="Nocturne Application Error" onReset={() => void reload()}>
      <div className={cn('nocturne-shell text-ink select-none relative', isMaximized && 'is-maximized')}>
        {/* Floating Window Controls in top-right */}
        {!cinemaOpen && (
          <div
            className="absolute top-3 right-4 z-[60] flex items-center gap-1 rounded-xl border border-white/10 bg-[#121419]/90 px-1.5 py-1 backdrop-blur-xl pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => void handleMinimize()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-ink focus-visible:outline-none"
              aria-label="Minimize window"
              title="Minimize"
            >
              <Minus size={14} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void handleToggleMaximize()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-ink focus-visible:outline-none"
              aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Copy size={13} className="rotate-90" aria-hidden />
              ) : (
                <Square size={13} aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleClose()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-red-500/80 hover:text-white focus-visible:outline-none"
              aria-label="Close window"
              title="Close"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        )}

        {/* Left Dock Island (MicroDock) */}
        <div
          className={cn(
            'island-dock pointer-events-auto z-20 transition-opacity duration-200',
            isCoverViewOpen && 'invisible pointer-events-none'
          )}
          aria-hidden={isCoverViewOpen}
        >
          <ErrorBoundary fallbackTitle="Sidebar Error">
            <MicroDock
              items={DOCK_ITEMS}
              activeId={view === 'stage' ? 'stage' : view === 'library' ? 'library' : ''}
              onSelect={handleDockSelect}
              expanded={dockExpanded}
              onToggleExpand={() => setDockExpanded(!dockExpanded)}
            />
          </ErrorBoundary>
        </div>

        {/* Center Island (Cinematic Stage or Library) */}
        <section
          className={cn(
            'island island-stage pointer-events-auto z-10 transition-opacity duration-200',
            isCoverViewOpen && 'invisible pointer-events-none'
          )}
          aria-label="Main view"
          aria-hidden={isCoverViewOpen}
        >
          <ErrorBoundary fallbackTitle="Stage / Library Error">
            <CenterIsland
              libraryContent={libraryContent}
              onAddFolder={() => void addFolder()}
              scanning={scanning}
            />
          </ErrorBoundary>
        </section>

        {/* Right Island (Queue Panel) */}
        <aside
          className={cn(
            'island island-queue pointer-events-auto z-10 transition-opacity duration-200',
            isCoverViewOpen && 'invisible pointer-events-none'
          )}
          aria-label="Play queue"
          aria-hidden={isCoverViewOpen}
        >
          <ErrorBoundary fallbackTitle="Queue Error">
            <QueuePanel />
          </ErrorBoundary>
        </aside>

        {/* Bottom Floating Player Capsule */}
        <footer
          data-player-bar="true"
          className={cn(
            'island island-player pointer-events-auto z-40 relative transition-opacity duration-200',
            isCoverViewOpen && 'invisible pointer-events-none'
          )}
          aria-label="Player controls"
          aria-hidden={isCoverViewOpen}
        >
          <ErrorBoundary fallbackTitle="Player Controls Error">
            <PlayerBar onOpenCoverView={() => setIsCoverViewOpen(true)} />
          </ErrorBoundary>
        </footer>

        {/* Responsive Slide-Over Sheet for screens < 1024px */}
        <QueueSheet />

        {/* 3D CoverFlow Carousel Modal */}
        {isCoverViewOpen && (
          <ErrorBoundary fallbackTitle="CoverFlow Error" onReset={() => setIsCoverViewOpen(false)}>
            <CoverFlowView
              tracks={tracks.length > 0 ? tracks : (filtered.length > 0 ? filtered : [])}
              activeTrackId={currentTrackId}
              activeIndex={activeTrackIndex}
              onSelectTrack={(track, index) => {
                if (track && track.missing !== 1) {
                  const activeList = tracks.length > 0 ? tracks : filtered
                  const idx = activeList.findIndex((t) => t.id === track.id)
                  if (idx >= 0) void playTrackAt(idx)
                }
              }}
              onDismiss={() => setIsCoverViewOpen(false)}
            />
          </ErrorBoundary>
        )}

        {/* Immersive Cinema Stage Modal */}
        {cinemaOpen && (
          <ErrorBoundary fallbackTitle="Cinema Stage Error" onReset={() => setCinemaOpen(false)}>
            <CinemaStage onClose={() => setCinemaOpen(false)} />
          </ErrorBoundary>
        )}

        {/* Context Menu for Tracks */}
        {(() => {
          if (!menu) return null
          const track = tracks.find((t) => t.id === menu.trackId)
          if (!track) return null
          const items: ContextMenuItem[] = [
            {
              key: 'play',
              label: 'Play',
              icon: <Play size={15} aria-hidden />,
              disabled: track.missing === 1,
              onSelect: () => {
                const index = tracks.findIndex((t) => t.id === track.id)
                if (index >= 0) void playTrackAt(index)
              }
            },
            {
              key: 'copy',
              label: 'Copy Path',
              icon: <Copy size={15} aria-hidden />,
              onSelect: () => void copyPath(track.path)
            },
            {
              key: 'remove',
              label: 'Remove from Library',
              icon: <Trash2 size={15} aria-hidden />,
              destructive: true,
              onSelect: () => setPendingRemove({ id: track.id, title: track.title ?? 'Track' })
            }
          ]
          return (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              items={items}
              onClose={() => setMenu(null)}
              ariaLabel={`Actions for ${track.title ?? 'track'}`}
            />
          )
        })()}

        {/* Clear Library Dialog */}
        <AlertDialog
          open={clearConfirmOpen}
          title="Clear library?"
          description={`This removes all ${tracks.length} indexed tracks from Nocturne. Your audio files stay untouched on disk.`}
          confirmLabel="Clear Library"
          waitingLabel="Clearing…"
          destructive
          onCancel={() => setClearConfirmOpen(false)}
          onConfirm={() => void clearLibrary()}
        />

        {/* Remove Track Dialog */}
        <AlertDialog
          open={pendingRemove !== null}
          title="Remove from library?"
          description={
            pendingRemove
              ? `“${pendingRemove.title}” will be removed from Nocturne. The audio file stays untouched on disk.`
              : undefined
          }
          confirmLabel="Remove"
          waitingLabel="Removing…"
          destructive
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            if (!pendingRemove) return
            const id = pendingRemove.id
            setPendingRemove(null)
            void removeTrack(id)
          }}
        />

        {/* Studio Command Palette & Shortcut Atlas */}
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onRunCommand={handleRunCommand}
          initialTab={paletteTab}
        />
      </div>
    </ErrorBoundary>
  )
}
