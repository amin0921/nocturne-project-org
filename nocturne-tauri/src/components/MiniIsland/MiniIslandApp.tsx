import React, { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { MiniIslandCard } from './MiniIslandCard'
import { MINI_POSITION_STORAGE_KEY } from '../../services/player-broadcast'

/**
 * MiniIslandApp — root shell for the transparent mini-island window (360x130).
 * Centered morphing card; collapse via the outer transparent padding
 * (pointerdown/ click where target === root — never card taps, which drive
 * drag/expand), the expanded-card chevron, or Escape. Blocks the webview
 * context menu (no Refresh/Inspect escape hatch). window.focus() on mount so
 * keydown reaches this webview; App.tsx re-focuses on every show() (the
 * window is created with focus:false). Persists physical position on move —
 * guarded for 600ms after mount and after every 'mini-island:reveal' so
 * programmatic repositioning (App.tsx setPosition-before-show) can never
 * overwrite a user-dragged coordinate. Each reveal bumps enterKey, driving
 * the collapsed pill's liquid-droplet entrance (Step 83).
 */
export default function MiniIslandApp(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const [enterKey, setEnterKey] = useState(0)
  const saveGuardUntilRef = useRef(0)

  const collapse = useCallback(() => setIsExpanded(false), [])
  const toggleExpand = useCallback(() => setIsExpanded((v) => !v), [])

  // Keyboard capture: the OS window is created with focus:false — grab DOM
  // focus as soon as this webview mounts so Escape can reach the listener.
  useEffect(() => {
    window.focus()
  }, [])

  // Reveal signal (emitted by App.tsx just before setPosition + show):
  // re-arm the save-guard and queue the droplet entrance for this reveal.
  // Mount arm covers window-creation position events during the first 600ms.
  useEffect(() => {
    saveGuardUntilRef.current = performance.now() + 600
    const unlistenPromise = listen('mini-island:reveal', () => {
      saveGuardUntilRef.current = performance.now() + 600
      setEnterKey((k) => k + 1)
    })
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])

  // Persist physical position while dragging the pill — suppressed during
  // the active guard window (mount / reveal) per Step 83.
  useEffect(() => {
    const win = getCurrentWindow()
    const unlistenPromise = win.onMoved((event) => {
      if (performance.now() < saveGuardUntilRef.current) return
      try {
        localStorage.setItem(
          MINI_POSITION_STORAGE_KEY,
          JSON.stringify({ x: event.payload.x, y: event.payload.y })
        )
      } catch {
        // Storage unavailable — position simply won't persist.
      }
    })
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])

  // Global Escape listener: collapse the expanded card from anywhere.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [collapse])

  const collapseFromPadding = (target: EventTarget | null, current: EventTarget | null): void => {
    if (target === current) collapse()
  }

  return (
    <div
      className="flex h-[130px] w-[360px] items-center justify-center bg-transparent select-none"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => collapseFromPadding(e.target, e.currentTarget)}
      onClick={(e) => collapseFromPadding(e.target, e.currentTarget)}
    >
      <MiniIslandCard
        isExpanded={isExpanded}
        onToggleExpand={toggleExpand}
        enterKey={enterKey}
      />
    </div>
  )
}
