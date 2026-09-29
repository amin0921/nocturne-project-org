import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Copy, FolderOpen, ListMusic, ListPlus } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { addToQueue, playNext, type PlayerTrack } from '../stores/usePlayerStore'
import { cn } from '../lib/utils'
import { IS_MACOS } from '../lib/platform'

export interface TrackContextMenuProps {
  track: PlayerTrack | null
  position: { x: number; y: number } | null
  onClose: () => void
}

/**
 * OS file-manager name. "Explorer" is the Windows shell; macOS calls it Finder.
 * The non-macOS branch returns the exact string Windows has always displayed.
 */
const REVEAL_LABEL = IS_MACOS ? 'Show in Finder' : 'Show in Explorer'

/** Assumed footprint used for viewport clamping (menu never clips off-screen). */
const MENU_WIDTH = 210
const MENU_HEIGHT = 170
const EDGE_MARGIN = 16

interface TrackAction {
  key: string
  label: string
  icon: ReactNode
  run: (track: PlayerTrack) => void | Promise<unknown>
}

/**
 * Queue actions write to the store's PRIORITY tier (the "NEXT IN QUEUE"
 * section of the queue panel) and never touch the album/playlist order:
 * "Play Next" lands on top of the user queue, "Add to End of Queue" lands at
 * its tail. Playback drains that tier first, then resumes the intact playlist.
 */
const ACTIONS: TrackAction[] = [
  {
    key: 'play-next',
    label: 'Play Next',
    icon: <ListPlus size={15} aria-hidden />,
    run: (track) => playNext(track)
  },
  {
    key: 'add-to-queue',
    label: 'Add to End of Queue',
    icon: <ListMusic size={15} aria-hidden />,
    run: (track) => addToQueue(track)
  },
  {
    key: 'reveal',
    label: REVEAL_LABEL,
    icon: <FolderOpen size={15} aria-hidden />,
    run: (track) =>
      invoke('reveal_in_explorer', { path: track.path }).catch((err) =>
        console.debug('[TrackContextMenu] reveal_in_explorer failed:', err)
      )
  },
  {
    key: 'copy-info',
    label: 'Copy Song Title',
    icon: <Copy size={15} aria-hidden />,
    run: (track) =>
      navigator.clipboard
        .writeText(`${track.artist} - ${track.title}`)
        .catch((err) => console.debug('[TrackContextMenu] clipboard write failed:', err))
  }
]

/**
 * Floating SOLID obsidian capsule anchored to the right-click cursor.
 * Fully opaque `#0D0F15` backdrop (zero bleed-through of the rows underneath)
 * and unconstrained line-height so glyph descenders ('g', 'y', 'p') are never
 * clipped. Opens at scale-[0.96] → scale-100 over 150ms, clamps itself inside
 * the viewport, and dismisses on outside pointer-down, Escape, window blur,
 * resize or scroll. Shared by the library table and the queue panel.
 */
export function TrackContextMenu({
  track,
  position,
  onClose
}: TrackContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const open = track !== null && position !== null
  const [entered, setEntered] = useState(false)
  /** Click locker: one menu item dispatches at most once per open session. */
  const busyRef = useRef(false)

  // Entrance: paint one frame at scale-[0.96], then release the 150ms transition.
  useEffect(() => {
    if (!open) {
      setEntered(false)
      busyRef.current = false
      return
    }
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [open])

  // Dismissal triggers: outside pointerdown, Escape, blur (+ resize/scroll drift).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onBlur = (): void => onClose()
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [open, onClose])

  if (!open || !track || !position) return null

  // Anti-clipping: never let the capsule cross any window edge.
  const left = Math.max(
    EDGE_MARGIN,
    Math.min(position.x, window.innerWidth - MENU_WIDTH - EDGE_MARGIN)
  )
  const top = Math.max(
    EDGE_MARGIN,
    Math.min(position.y, window.innerHeight - MENU_HEIGHT - EDGE_MARGIN)
  )

  /**
   * Strict single-execution dispatch: stop the event from bubbling to the row
   * underneath, swallow the default action, run the payload exactly once (the
   * locker rejects a second dispatch from the same open session), then close.
   */
  const handleAction = (e: ReactMouseEvent, action: TrackAction, target: PlayerTrack): void => {
    e.stopPropagation()
    e.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    void action.run(target)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${track.title ?? 'track'}`}
      style={{ left, top, WebkitFontSmoothing: 'antialiased', textRendering: 'optimizeLegibility' }}
      className={cn(
        'fixed z-50 min-w-[210px] rounded-2xl border border-white/10 bg-[#0D0F15] p-1.5 select-none',
        'shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.05)]',
        'transition-all duration-150 ease-out',
        entered ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0'
      )}
    >
      {ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          role="menuitem"
          onClick={(e) => handleAction(e, action, track)}
          className="flex w-full items-center gap-2.5 overflow-visible rounded-xl px-3 py-2 text-left text-[13px] leading-normal text-muted transition-all duration-150 ease-out hover:bg-[#EAB308]/10 hover:text-[#EAB308] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/60"
        >
          <span className="shrink-0">{action.icon}</span>
          <span dir="auto" className="truncate overflow-visible font-medium">
            {action.label}
          </span>
        </button>
      ))}
    </div>
  )
}

export default TrackContextMenu
