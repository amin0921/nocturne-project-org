import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import {
  AppWindow,
  BarChart3,
  Command as CommandIcon,
  Disc3,
  Keyboard,
  Layers,
  Library,
  Mic2,
  Play,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  VolumeX,
  X,
  type LucideIcon
} from 'lucide-react'
import {
  STUDIO_COMMANDS,
  scoreCommand,
  type CommandItem
} from './commands'
import { Kbd, KbdSequence } from './Kbd'
import { ShortcutAtlas } from './ShortcutAtlas'
import { cn } from '../../lib/utils'
import './nocturne-palette.css'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRunCommand: (actionId: string) => void
  initialTab?: 'commands' | 'atlas'
}

const ICON_MAP: Record<string, LucideIcon> = {
  Play,
  SkipForward,
  SkipBack,
  VolumeX,
  Shuffle,
  Repeat,
  Disc3,
  Library,
  BarChart3,
  Search,
  Mic2,
  Layers,
  AppWindow,
  Keyboard
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  onRunCommand,
  initialTab = 'commands'
}) => {
  const [activeTab, setActiveTab] = useState<'commands' | 'atlas'>(initialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  // Keyboard-navigation lock: suppresses stationary-mouse hover hijacks while
  // the list programmatically scrolls rows underneath a resting pointer.
  const isKeyboardNav = useRef(false)
  // Panel-level dialog container: keyboard navigation lives here so it keeps
  // working no matter which element currently holds focus inside the modal.
  const panelRef = useRef<HTMLDivElement>(null)

  const [pillStyle, setPillStyle] = useState<{
    top: number
    height: number
    visible: boolean
  }>({
    top: 0,
    height: 0,
    visible: false
  })

  // Sync initial state when palette opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
      setSearchQuery('')
      setActiveIndex(0)
    }
  }, [open, initialTab])

  // Keep the search field focused whenever the commands view is active,
  // so keyboard navigation never loses its event target after tab toggles.
  useEffect(() => {
    if (!open || activeTab !== 'commands') return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, activeTab])

  // Filter & score commands
  const filteredCommands = useMemo(() => {
    if (activeTab !== 'commands') return []
    const scored = STUDIO_COMMANDS.map((cmd) => ({
      cmd,
      score: scoreCommand(cmd, searchQuery)
    })).filter((item) => item.score > 0)

    // Sort descending by score; if scores are equal, preserve natural order
    scored.sort((a, b) => b.score - a.score)
    return scored.map((item) => item.cmd)
  }, [activeTab, searchQuery])

  // Keep active index in bounds when list changes
  useEffect(() => {
    if (filteredCommands.length === 0) {
      setActiveIndex(0)
    } else if (activeIndex >= filteredCommands.length) {
      setActiveIndex(filteredCommands.length - 1)
    }
  }, [filteredCommands.length, activeIndex])

  // Measure and position the GPU gliding pill, and keep the active row
  // inside the scroll viewport with a manual scrollTop calculation
  // (scrollIntoView fights the DOM in WebView2 and never reaches the ends).
  useLayoutEffect(() => {
    if (!open || activeTab !== 'commands' || filteredCommands.length === 0) {
      setPillStyle((prev) => ({ ...prev, visible: false }))
      return
    }

    const list = listContainerRef.current
    const row = rowRefs.current[activeIndex]
    if (row && list) {
      setPillStyle({
        top: row.offsetTop,
        height: row.offsetHeight,
        visible: true
      })

      // Terminal wrap-around snapping: boundary items snap deterministically
      // to the true top/bottom (no halfway offsets).
      if (activeIndex === 0) {
        list.scrollTop = 0
        return
      }
      if (activeIndex === filteredCommands.length - 1) {
        list.scrollTop = list.scrollHeight
        return
      }

      const rowTop = row.offsetTop
      const rowBottom = rowTop + row.offsetHeight
      if (rowTop < list.scrollTop) {
        list.scrollTop = rowTop
      } else if (rowBottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = rowBottom - list.clientHeight
      }
    }
  }, [open, activeTab, activeIndex, filteredCommands])

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      onOpenChange(false)
      if (cmd.actionId === 'open-atlas') {
        setActiveTab('atlas')
        onOpenChange(true)
        return
      }
      onRunCommand(cmd.actionId)
    },
    [onOpenChange, onRunCommand]
  )

  // Single source of truth for list navigation — shared by the panel-level
  // arrow keys and the clickable footer keycaps.
  const move = useCallback(
    (delta: number) => {
      const total = filteredCommands.length
      if (total === 0) return
      const nextIdx = (activeIndex + delta + total) % total
      // Wrap past the end → snap the viewport cleanly to the very first item.
      if (nextIdx === 0 && listContainerRef.current) {
        listContainerRef.current.scrollTop = 0
      }
      // Wrap backwards from top → jump to the very last item at the bottom.
      if (
        nextIdx === total - 1 &&
        activeIndex === 0 &&
        listContainerRef.current
      ) {
        listContainerRef.current.scrollTop =
          listContainerRef.current.scrollHeight
      }
      isKeyboardNav.current = true
      setActiveIndex(nextIdx)
    },
    [activeIndex, filteredCommands.length]
  )

  const executeActive = useCallback(() => {
    if (filteredCommands[activeIndex]) {
      executeCommand(filteredCommands[activeIndex])
    }
  }, [activeIndex, filteredCommands, executeCommand])

  // Panel-level keyboard handler: navigation / activation / Escape never die
  // when focus drifts away from the search input onto chrome or background.
  const onPanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
        return
      }

      // `/` or `?` toggles the Atlas without requiring Shift.
      // Stop propagation so the global listener never double-handles it.
      if (
        (e.key === '?' || e.key === '/') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        setActiveTab((prev) => (prev === 'atlas' ? 'commands' : 'atlas'))
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        setActiveTab((prev) => (prev === 'commands' ? 'atlas' : 'commands'))
        return
      }

      if (activeTab !== 'commands') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        executeActive()
      }
    },
    [activeTab, move, executeActive, onOpenChange]
  )

  // Text editing (typing, backspace, selection) stays native in the input;
  // navigation / activation / Escape bubble up to onPanelKeyDown.
  const onInputKeyDown = useCallback(
    (_e: React.KeyboardEvent<HTMLInputElement>) => {
      // intentionally empty — handled at panel level
    },
    []
  )

  if (!open) return null

  return createPortal(
    <div
      className="nc-palette-backdrop"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Studio Command Palette"
    >
      <div className="nc-palette-spotlight" />

      <div
        ref={panelRef}
        className="nc-palette-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement
          // Native focus must still reach text inputs (commands search, Atlas filter).
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
          // Leave the scroll viewport alone so the scrollbar thumb stays draggable.
          if (target.closest('.nc-scroll-container')) return
          // Header tabs, footer keycaps, decorative chrome and background clicks
          // must never steal focus from the search input — arrow navigation has
          // to survive every mouse click inside the modal.
          e.preventDefault()
          if (activeTab === 'commands') inputRef.current?.focus()
        }}
      >
        {/* Header Bar with Tabs and Close Button */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 pt-3 pb-2 bg-[#121419]/90">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab('commands')
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
              className={cn(
                'nc-tab-btn flex items-center gap-2 pb-2 text-xs font-semibold text-faint transition-colors',
                activeTab === 'commands' && 'active text-ink'
              )}
            >
              <CommandIcon size={14} className={activeTab === 'commands' ? 'text-amber-500' : 'text-faint'} />
              <span>Commands</span>
              <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-faint">
                {STUDIO_COMMANDS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('atlas')
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
              className={cn(
                'nc-tab-btn flex items-center gap-2 pb-2 text-xs font-semibold text-faint transition-colors',
                activeTab === 'atlas' && 'active text-ink'
              )}
            >
              <Keyboard size={14} className={activeTab === 'atlas' ? 'text-amber-500' : 'text-faint'} />
              <span>Shortcut Atlas</span>
              <Kbd size="sm" className="text-[10px] h-4 min-w-4 px-1">/</Kbd>
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <Kbd size="sm">Tab</Kbd>
              <span className="text-[11px] text-white/40">Switch tabs</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-white/10 hover:text-ink transition-colors"
              aria-label="Close palette"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Commands View */}
        {activeTab === 'commands' && (
          <div className="flex flex-col">
            {/* Search Input Bar */}
            <div className="relative flex items-center border-b border-white/5 px-4 py-3 bg-[#0d0f15]">
              <Search size={16} className="text-amber-500/80 shrink-0" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Type a command (e.g. play, next, library)..."
                className="w-full bg-transparent px-3 text-xs text-ink placeholder:text-faint/60 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    inputRef.current?.focus()
                  }}
                  className="text-faint hover:text-ink transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Commands List with GPU Gliding Pill */}
            <div
              ref={listContainerRef}
              className="relative max-h-[52vh] overflow-y-auto nc-scroll-container py-2 px-2"
            >
              {/* GPU Gliding Pill */}
              {pillStyle.visible && (
                <div
                  className="nc-pill"
                  style={{
                    transform: `translateY(${pillStyle.top}px)`,
                    height: `${pillStyle.height}px`
                  }}
                />
              )}

              {filteredCommands.length === 0 ? (
                <div className="py-12 text-center text-xs text-faint">
                  No commands match “{searchQuery}”.
                </div>
              ) : (
                filteredCommands.map((cmd, index) => {
                  const Icon = ICON_MAP[cmd.icon] || CommandIcon
                  const isActive = index === activeIndex

                  return (
                    <div
                      key={cmd.id}
                      ref={(el) => {
                        rowRefs.current[index] = el
                      }}
                      onClick={() => executeCommand(cmd)}
                      onMouseMove={(e) => {
                        const moved =
                          e.movementX !== 0 || e.movementY !== 0
                        // Reset the keyboard lock ONLY on genuine pointer movement.
                        if (moved) {
                          isKeyboardNav.current = false
                        }
                        // While the keyboard lock is held, ignore hover entirely —
                        // guards against synthetic mousemove events triggered by
                        // programmatic list scrolling under a stationary pointer.
                        if (isKeyboardNav.current) return
                        if (!moved) return
                        setActiveIndex(index)
                      }}
                      className={cn(
                        'nc-row relative z-[2] flex cursor-pointer items-center justify-between h-11 px-3 py-0 select-none transition-colors',
                        isActive ? 'text-white' : 'text-faint hover:text-ink'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                            isActive
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                              : 'border-white/5 bg-[#121419] text-faint'
                          )}
                        >
                          <Icon size={14} />
                        </div>
                        <span
                          className={cn(
                            'truncate text-xs font-medium transition-colors',
                            isActive ? 'text-white font-semibold' : 'text-ink'
                          )}
                        >
                          {cmd.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-3">
                        <span className="text-[10px] font-mono text-faint/60 hidden sm:inline-block">
                          {cmd.categoryLabel}
                        </span>
                        <KbdSequence keys={cmd.shortcut} size="sm" active={isActive} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Shortcut Atlas View */}
        {activeTab === 'atlas' && (
          <ShortcutAtlas onSelectAction={(id) => onRunCommand(id)} />
        )}

        {/* Footer Navigation Hints — clickable keycaps perform their action */}
        <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 bg-[#121419]/90 text-[11px] text-faint font-mono">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                move(-1)
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-white/5"
              aria-label="Move selection up"
            >
              <Kbd size="sm">↑</Kbd>
              <span className="text-[10px] text-white/60 font-medium">Navigate</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                move(1)
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-white/5"
              aria-label="Move selection down"
            >
              <Kbd size="sm">↓</Kbd>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                executeActive()
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-white/5"
              aria-label="Run active command"
            >
              <Kbd size="sm">↵</Kbd>
              <span className="text-[10px] text-white/60 font-medium">Run</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onOpenChange(false)
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-white/5"
              aria-label="Close palette"
            >
              <Kbd size="sm">Esc</Kbd>
              <span className="text-[10px] text-white/60 font-medium">Close</span>
            </button>
            <span className="flex items-center gap-1 px-1.5">
              <Kbd size="sm">Ctrl</Kbd>
              <span className="text-[10px] text-faint/60">+</span>
              <Kbd size="sm">K</Kbd>
              <span className="text-[10px] text-white/60 font-medium">Toggle</span>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
