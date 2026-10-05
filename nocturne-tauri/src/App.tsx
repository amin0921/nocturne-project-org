import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { currentMonitor, getCurrentWindow, monitorFromPoint } from '@tauri-apps/api/window'
import { LogicalPosition, PhysicalPosition } from '@tauri-apps/api/dpi'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { Copy, Disc3, FileAudio, Minus, Square, Trash2, X } from 'lucide-react'
import CoverFlowView from './components/CoverFlowView'
import { CinemaStage } from './components/cinema'
import PlayerBar from './components/PlayerBar'
import MicroDock from './components/MicroDock'
import CenterIsland from './components/CenterIsland'
import RestoreBanner from './components/sessions/RestoreBanner'
import QueuePanel from './components/QueuePanel'
import QueueSheet from './components/QueueSheet'
import TrackContextMenu from './components/TrackContextMenu'
import EqBars from './components/EqBars'
import ErrorBoundary from './components/ErrorBoundary'
import { MINI_TOP_DOCK_Y } from './components/MiniIsland/magneticSnap'
import { AlertDialog } from './components/ui/alert-dialog'
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
  publishPlayerState,
  setQueue,
  toggleMute,
  togglePlay,
  toggleShuffle,
  usePlayerStore,
  type PlayerTrack
} from './stores/usePlayerStore'
import { CommandPalette } from './components/command-palette'
import { cn, formatTime } from './lib/utils'
import { IS_MACOS } from './lib/platform'
import { useStudioHotkeys } from './hooks/useStudioHotkeys'
import {
  MINI_PINNED_STORAGE_KEY,
  MINI_POSITION_STORAGE_KEY
} from './services/player-broadcast'
import { setMiniWindow } from './services/mini-window'

/** Mirrors the Rust `ImportResultDto` returned by the ingestion commands. */
interface ImportResultDto {
  inserted: number
  skipped: number
}

/**
 * Upper bound on the mini-island "I have mounted and my reveal listener is
 * armed" handshake. Only a cold webview start pays this, and only if it stalls.
 */
const MINI_READY_TIMEOUT_MS = 2000

/** One-line summary for the import status strip. */
function describeImport(result: ImportResultDto): string {
  const head = `Added ${result.inserted} new song${result.inserted === 1 ? '' : 's'}`
  if (result.skipped <= 0) return head
  return `${head} (${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped)`
}

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
  const [trackMenu, setTrackMenu] = useState<{ track: PlayerTrack; x: number; y: number } | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ id: number; title: string } | null>(null)
  const [isCoverViewOpen, setIsCoverViewOpen] = useState(false)
  const [dockExpanded, setDockExpanded] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [deduping, setDeduping] = useState(false)
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

    // ZERO-DEBOUNCE maximize sync. The native HWND frame resizes immediately, so
    // any trailing debounce (the previous 250ms) left a window where the OS
    // viewport was already small while `.is-maximized` was still applied — the
    // queue island and the PlayerBar's right half clipped outside the frame.
    // This reads the state synchronously on every resize frame instead.
    const syncMaximized = (): void => {
      void win
        .isMaximized()
        .then((max) => {
          if (active) setIsMaximized(max)
        })
        .catch(() => {})
    }

    syncMaximized()
    const unlistenPromise = win.onResized(syncMaximized)

    // TRANSIENT RESIZE SUSPENSION. While the native frame is changing bounds
    // (maximize, restore, drag-resize), `.is-resizing` on the shell kills every
    // CSS transition inside it (see the `.nocturne-shell.is-resizing` rule in
    // index.css) so all descendants snap to the new viewport in the same frame
    // the DWM buffer is reallocated. It is removed ~150ms after the LAST resize
    // event, letting opacity fades resume once the geometry is settled.
    // setIsResizing(true) on an already-true state is a React bailout, so this
    // adds at most two re-renders per bounds transition (arm + settle).
    let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null
    const unlistenResizeSuspension = win.onResized(() => {
      setIsResizing(true)
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      resizeSettleTimer = setTimeout(() => setIsResizing(false), 150)
    })

    return () => {
      active = false
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
      unlistenResizeSuspension.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])

  // Step 79: floating mini-island visibility sync. Main minimized → show the
  // mini pill (unless pinned flag disabled); restored/focused → DESTROY it.
  // Detection: isMinimized + onFocusChanged + debounced onResized (150ms).
  //
  // P0 idle-CPU fix: the window is created ON DEMAND and destroyed on restore.
  // It used to be a static `visible: false` entry in tauri.conf.json, which
  // kept a second WebView2 renderer alive at all times (~18% CPU while the app
  // merely sat in the tray/idle). Geometry, position memory, entrance and
  // timing are byte-for-byte what the static window produced.
  useEffect(() => {
    let active = true
    const win = getCurrentWindow()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    // Live mini handle + in-flight creation promise. The promise collapses the
    // focus/resize bursts (and React StrictMode's double effect mount) into a
    // single window — never two.
    let mini: WebviewWindow | null = null
    let miniCreation: Promise<WebviewWindow | null> | null = null

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

    /** Same construction options the static tauri.conf.json entry used. */
    const MINI_WINDOW_OPTIONS = {
      url: 'index.html',
      width: 360,
      height: 130,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: false,
      visible: false
    } as const

    const createMiniWindow = (): Promise<WebviewWindow | null> => {
      // Another caller is mid-creation — share its result.
      if (miniCreation) return miniCreation
      miniCreation = (async () => {
        // An orphan can still exist (e.g. the app was killed mid-minimize), so
        // adopt it rather than creating a duplicate label.
        const existing = await WebviewWindow.getByLabel('mini-island')
        if (existing) return existing

        // The reveal listener lives in MiniIslandApp's mount effect, and the
        // liquid-droplet entrance is armed ONLY by an enterKey bump. A window
        // created and shown before that effect runs would swallow the reveal
        // and pop in with NO entrance — so wait for the child webview to
        // announce itself. The handshake is bounded: a slow or failed load must
        // never strand the user in "app minimized, no pill".
        let signalReady = (): void => {}
        const ready = new Promise<void>((resolve) => {
          signalReady = resolve
        })
        // Registered BEFORE the constructor runs, so no announce can be missed.
        let unlistenReady: (() => void) | null = null
        try {
          unlistenReady = await listen('mini-island:ready', () => signalReady())
        } catch {
          // No handshake available — the reveal is best-effort either way.
        }

        let signalCreated = (): void => {}
        const created = new Promise<void>((resolve) => {
          signalCreated = resolve
        })
        let signalFailed = (): void => {}
        const failed = new Promise<void>((resolve) => {
          signalFailed = resolve
        })

        const handle = new WebviewWindow('mini-island', MINI_WINDOW_OPTIONS)
        void Promise.all([
          handle.once('tauri://created', () => signalCreated()),
          handle.once('tauri://error', () => signalFailed())
        ]).catch(() => signalFailed())

        try {
          await Promise.race([created, failed])
          await Promise.race([
            ready,
            new Promise<void>((resolve) => window.setTimeout(resolve, MINI_READY_TIMEOUT_MS))
          ])
        } finally {
          if (unlistenReady) unlistenReady()
        }
        return handle
      })()
      return miniCreation
    }

    const syncMiniIsland = async (): Promise<void> => {
      if (!active) return
      try {
        const minimized = await win.isMinimized()
        if (minimized && isPinned()) {
          if (!mini) {
            const handle = await createMiniWindow()
            if (!active || !handle) return
            mini = handle
            setMiniWindow(handle)
            // The window just mounted with an empty mirror store — prime it
            // before the first paint so the pill never appears blank.
            publishPlayerState()
          }
          // Reveal signal BEFORE programmatic positioning: arms the mini's
          // 600ms onMoved save-guard so this setPosition cannot overwrite the
          // stored user coordinate, and queues the liquid-droplet entrance.
          await emit('mini-island:reveal').catch(() => undefined)
          const stored = readStoredPosition()
          if (stored) {
            await mini.setPosition(new PhysicalPosition(stored.x, stored.y))
          } else {
            // DPI-aware top-center anchor. screen.width is CSS-pixel/DPI-unaware
            // and drifts under display scaling — use the active display's monitor
            // geometry instead: physical width / scaleFactor = logical px.
            //
            // Resolve the DISPLAY THE MAIN WINDOW IS ON, not the one under the
            // cursor. The bare `currentMonitor()` returns the cursor's display,
            // so on a multi-monitor setup the island could land on a screen the
            // app is not even on. `@tauri-apps/api` 2.11 has no
            // `Window.currentMonitor()`, so the equivalent is `monitorFromPoint`
            // on the window's own centre.
            //
            // A minimized window's outer position can be stale or off-screen, so
            // in that case — and if the point resolves to nothing — fall back to
            // the original cursor-monitor lookup rather than guessing.
            let monitor = null
            if (!minimized) {
              const [pos, size] = await Promise.all([
                win.outerPosition(),
                win.outerSize()
              ])
              monitor = await monitorFromPoint(pos.x + size.width / 2, pos.y + size.height / 2)
            }
            if (!monitor) monitor = await currentMonitor()
            const logicalWidth = monitor
              ? monitor.size.width / monitor.scaleFactor
              : window.screen.width
            const x = Math.max(0, Math.round((logicalWidth - 360) / 2))
            // y is the top-edge dock offset: 16 on Windows (unchanged), 40 on
            // macOS so the 130px island clears the menu bar and the camera notch.
            await mini.setPosition(new LogicalPosition(x, MINI_TOP_DOCK_Y))
          }
          await mini.show()
          // focus:false at creation — claim focus on appearance so the mini's
          // Escape listener receives keydown without requiring a prior click.
          await mini.setFocus()
        } else if (mini) {
          // Restore/unminimize (or unpin): DESTROY rather than hide. A hidden
          // WebView2 renderer is exactly what burned ~18% CPU all session —
          // teardown is the whole point of this fix. The next minimize builds
          // a fresh window, so the pill is always a clean first paint.
          const doomed = mini
          mini = null
          miniCreation = null
          setMiniWindow(null)
          await doomed.destroy()
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
      // StrictMode remounts the effect; drop the stale handle so the fan-out
      // gate and the next mount's window lookup start from a clean slate.
      if (mini) {
        mini = null
        miniCreation = null
        setMiniWindow(null)
      }
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
  // - Ctrl+1 / Cmd+1: Stage View
  // - Ctrl+2 / Cmd+2: Library View
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

      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        setView('stage')
      } else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault()
        setView('library')
      } else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
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

  // Right-click anywhere on a library or queue row → shared floating glass menu.
  const handleTrackContextMenu = useCallback((track: PlayerTrack, e: React.MouseEvent) => {
    e.preventDefault()
    setTrackMenu({ track, x: e.clientX, y: e.clientY })
  }, [])

  // History rows are path-keyed; map them back to full library tracks.
  const resolveLibraryTrack = useCallback(
    (path: string) => tracks.find((t) => t.path === path),
    [tracks]
  )

  const closeTrackMenu = useCallback(() => setTrackMenu(null), [])

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
        <span className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
          {track?.missing === 1 && (
            <span className="shrink-0 rounded-full border border-linestrong px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint">
              missing
            </span>
          )}
          <span className="numeric truncate text-xs tabular-nums text-faint">
            {formatTime(track?.duration_secs)}
          </span>
        </span>
      )
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'w-14',
      // overflow-visible overrides the DataTable cell's `overflow-hidden`
      // (twMerge: later wins): the CSS tooltip bubble is absolutely positioned
      // to the LEFT of the trash icon and wider than this 56px cell — clipped
      // here it painted as a mysterious half-cut sliver (owner report).
      // `isolate` (stacking context) is the second half of the fix: without
      // it the unclipped cell's region painted in Chromium's late content
      // phase, letting the hovered row's background wash over the PREVIOUS
      // row's collapsed border — the divider looked bolder right above the
      // trash icon (verified by pixel sampling; see divider step report).
      cellClassName: 'w-14 overflow-visible isolate',
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
      // 1. Native DIRECTORY picker (`pick_folder` → tauri-plugin-dialog with
      // directory mode): the user selects the target folder itself (e.g.
      // "songs") and confirms via the native "Select Folder" button — no file
      // filter, no need to navigate inside or pick an audio file. No UI state
      // mutations happen until a folder is actually chosen — cancel is a
      // silent no-op.
      const picked = await invoke<string | null>('pick_folder')
      if (!picked) {
        // User cancelled dialog — zero state mutations, zero queries, zero loading indicators
        return
      }

      // 2. Folder confirmed: instant notice so the click visibly registers,
      // then live feedback. The Rust side (`resolve_folder_root`) canonicalizes
      // the directory (or falls back to the parent if an edge-case file path
      // arrives) and `scan_folder` walks it recursively.
      setScanning(true)
      setNotice('Starting folder scan...')
      setScanProgress(null)

      const unlisten = await listen<{ scanned: number; total: number }>('scan-progress', (event) => {
        setScanProgress(event.payload)
        if (event.payload && event.payload.total > 0) {
          setNotice(`Scanning ${event.payload.scanned} of ${event.payload.total}...`)
        }
      })

      try {
        const result = await invoke<ImportResultDto>('scan_folder', { path: picked })
        setNotice(describeImport(result))
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

  /** Header counter while ingesting: live X/Y numbers, never a frozen string. */
  const scanLabel = useMemo(() => {
    if (scanProgress && scanProgress.total > 0) {
      return `Scanning ${scanProgress.scanned}/${scanProgress.total}`
    }
    return 'Scanning…'
  }, [scanProgress])

  // "Add Files": native multi-select file dialog (not a folder picker), so every
  // audio track is visible in Explorer with name/size before selection. Backend
  // picks the dialog (`pick_audio_files`) and indexes the paths (`import_audio_files`),
  // emitting `scan-progress` per parsed file for live numeric feedback.
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

      const unlisten = await listen<{ scanned: number; total: number }>('scan-progress', (event) => {
        setScanProgress(event.payload)
        if (event.payload && event.payload.total > 0) {
          setNotice(`Importing ${event.payload.scanned} / ${event.payload.total} tracks...`)
        }
      })

      try {
        const result = await invoke<ImportResultDto>('import_audio_files', { filePaths: selected })
        setNotice(describeImport(result))
        await reload()
      } finally {
        unlisten()
      }
    } catch (err) {
      console.error('[Import files error]:', err)
      setNotice(`Import failed: ${String(err)}`)
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }, [reload])

  /**
   * OS drag-and-drop ingestion. Tauri owns the drop (the webview's own HTML5
   * drag events are disabled by `dragDropEnabled`), and hands us a mixed list of
   * folder and file paths. The folder/file split and all path validation happen
   * in Rust -- this side never stats anything, it just forwards and reports.
   */
  const ingestDropped = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setScanning(true)
      setScanProgress(null)
      setNotice(`Adding ${paths.length} dropped item${paths.length === 1 ? '' : 's'}…`)
      try {
        const unlisten = await listen<{ scanned: number; total: number }>('scan-progress', (event) => {
          setScanProgress(event.payload)
          if (event.payload && event.payload.total > 0) {
            setNotice(`Importing ${event.payload.scanned} / ${event.payload.total} tracks...`)
          }
        })
        try {
          const result = await invoke<ImportResultDto>('ingest_paths', { paths })
          setNotice(describeImport(result))
          await reload()
        } finally {
          unlisten()
        }
      } catch (err) {
        setNotice(`Could not add dropped items: ${String(err)}`)
      } finally {
        setScanning(false)
        setScanProgress(null)
      }
    },
    [reload]
  )

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void getCurrentWindow()
      .onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'over') {
          setDropActive(true)
          return
        }
        setDropActive(false)
        if (payload.type === 'drop') {
          void ingestDropped(payload.paths)
        }
      })
      .then((fn) => {
        // The listener may resolve after teardown; release it immediately then.
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {
        // Drag & drop unavailable: the Add Folder / Add Files buttons still work.
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [ingestDropped])

  /** Manual re-run of the dedup pass. Database rows only; no file is touched. */
  const removeDuplicates = useCallback(async () => {
    setDeduping(true)
    try {
      const purged = await invoke<number>('deduplicate_library')
      setNotice(
        purged > 0
          ? `Removed ${purged} duplicate ${purged === 1 ? 'row' : 'rows'}`
          : 'No duplicates found'
      )
      await reload()
    } catch (err) {
      setNotice(`Could not remove duplicates: ${String(err)}`)
    } finally {
      setDeduping(false)
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

  /**
   * Optimistic maximize toggle: the layout class is committed BEFORE the native
   * call resolves, so the DOM reflows in the same frame as the click instead of
   * trailing the OS animation. A failed toggle re-syncs from the real state.
   */
  const handleToggleMaximize = useCallback(async () => {
    const win = getCurrentWindow()
    try {
      const next = !(await win.isMaximized())
      setIsMaximized(next)
      await win.toggleMaximize()
    } catch (err) {
      console.debug('Window toggleMaximize error:', err)
      win
        .isMaximized()
        .then((max) => setIsMaximized(max))
        .catch(() => {})
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/5 px-5 py-2.5 pointer-events-auto">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search title, artist, album…"
          ariaLabel="Search library"
          className="max-w-md flex-1"
        />
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-faint numeric">
          {scanning ? scanLabel : countText}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void removeDuplicates()}
            disabled={scanning || deduping}
            title="Keep one copy of each song and remove duplicate library rows"
            className="flex h-8 items-center rounded-lg px-3 text-xs font-medium text-faint hover:bg-raised/80 hover:text-ink disabled:opacity-50 transition-colors"
          >
            {deduping ? 'Removing…' : 'Remove Duplicates'}
          </button>
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
            if (track) handleTrackContextMenu(track, event)
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
      <div
        className={cn(
          'nocturne-shell text-ink select-none relative',
          // `.is-maximized` is a Windows-only compensation: frameless maximize
          // on Windows 10/11 leaves the content inset from the frame, so the
          // rule bumps the shell padding from 1rem to 1.5rem. macOS has no such
          // offset, so the class is withheld there and the base padding applies.
          isMaximized && !IS_MACOS && 'is-maximized',
          // Bounds-transition suspension: see `.nocturne-shell.is-resizing`.
          isResizing && 'is-resizing'
        )}
      >
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

        {/* Crash / session restore banner — placed as a second grid item in
            the stage area, so its containing box IS the center island: the
            banner centers over the island regardless of dock width and can
            inset from the island's top edge. pointer-events stays off at the
            wrapper level; .restore-banner re-enables it for itself. */}
        <div className="pointer-events-none relative z-40 [grid-area:stage]">
          <RestoreBanner />
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
            <QueuePanel onTrackContextMenu={handleTrackContextMenu} resolveTrack={resolveLibraryTrack} />
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
        <QueueSheet onTrackContextMenu={handleTrackContextMenu} resolveTrack={resolveLibraryTrack} />

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

        {/* Floating glass track context menu (library table + queue rows) */}
        <TrackContextMenu
          track={trackMenu?.track ?? null}
          position={trackMenu ? { x: trackMenu.x, y: trackMenu.y } : null}
          onClose={closeTrackMenu}
        />

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

        {/* OS drag-and-drop target overlay. `transform-gpu` keeps the fade on
            the compositor so it stays smooth while a scan runs underneath. */}
        {dropActive && (
          <div
            className="pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-black/55 backdrop-blur-[2px]"
            aria-hidden="true"
          >
            <div className="transform-gpu rounded-2xl border border-dashed border-ember/70 bg-surface/90 px-12 py-9 text-center shadow-island">
              <p className="text-sm font-medium text-ink">Drop audio files to add to library</p>
              <p className="mt-1.5 text-xs text-faint">Folders are scanned recursively</p>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
