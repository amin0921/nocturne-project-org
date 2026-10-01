import React, { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { MiniIslandCard } from './MiniIslandCard'
import { settleMagneticSnap } from './magneticSnap'
import { MINI_POSITION_STORAGE_KEY } from '../../services/player-broadcast'

/**
 * MiniIslandApp — root shell for the transparent mini-island window (360x130).
 * Centered morphing card; collapse via the outer transparent overlay
 * (pointerdown/ click where target === root, or anywhere the card does not
 * contain the press — never card taps, which drive drag/expand), the
 * expanded-card chevron (onCollapse), the card's empty squircle corners
 * (handled inside MiniIslandCard), or Escape. Patch 140: the overlay handler
 * is explicitly gated on isExpanded and carries data-tauri-drag-region="false"
 * so no drag surface can intercept a press meant for the collapse trigger.
 * Blocks the webview context menu (no Refresh/Inspect escape hatch).
 * window.focus() on mount so
 * keydown reaches this webview; App.tsx re-focuses on every show() (the
 * window is created with focus:false). Persists physical position on move —
 * guarded for 600ms after mount and after every 'mini-island:reveal' so
 * programmatic repositioning (App.tsx setPosition-before-show) can never
 * overwrite a user-dragged coordinate. Each reveal bumps enterKey, driving
 * the collapsed pill's liquid-droplet entrance (Step 83).
 *
 * Magnetic settle: each onMoved debounces 180ms (drag-release detector),
 * then settleMagneticSnap evaluates the top-center notch / side-rail zones
 * and the taskbar work-area guard in DPI-aware logical px, glides the
 * window ~130ms ease-out into its target, and persists the settled
 * physical coordinate. Skipped during the 600ms guard window and while a
 * glide is in flight; the native drag region is never intercepted.
 */
export default function MiniIslandApp(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const [enterKey, setEnterKey] = useState(0)
  const saveGuardUntilRef = useRef(0)
  const glidingRef = useRef(false)

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
    // P0 on-demand lifecycle: this window no longer exists at startup — it is
    // created the moment the main window is minimized. App.tsx holds its reveal
    // emit until the listener above is armed, otherwise the first appearance
    // would pop in with no droplet entrance at all. Announce readiness only
    // AFTER the subscribe round-trip resolves, so the two IPC calls stay
    // ordered and the reveal can never arrive first.
    void unlistenPromise
      .then(() => emit('mini-island:ready'))
      .catch(() => undefined)
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])

  // Persist physical position while dragging the pill — suppressed during
  // the active guard window (mount / reveal) per Step 83. The 180ms
  // post-move debounce is the drag-release detector for the magnetic snap.
  useEffect(() => {
    const win = getCurrentWindow()
    let settleTimer: number | null = null

    const runSettle = (): void => {
      if (glidingRef.current) return
      if (performance.now() < saveGuardUntilRef.current) return
      glidingRef.current = true
      void settleMagneticSnap(win)
        .then((settled) => {
          if (!settled) return
          try {
            localStorage.setItem(MINI_POSITION_STORAGE_KEY, JSON.stringify(settled))
          } catch {
            // Storage unavailable — position simply won't persist.
          }
        })
        .catch(() => undefined)
        .finally(() => {
          glidingRef.current = false
        })
    }

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
      if (glidingRef.current) return
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = null
        runSettle()
      }, 180)
    })
    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer)
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

  // Patch 140 — explicit pointer-down collapse on the transparent overlay
  // (window padding around the card). Gated on isExpanded so collapsed-pill
  // taps are never hijacked, and target === currentTarget guarantees a press
  // on the card itself (or its controls) can never collapse it; the
  // contains() branch additionally covers presses that land on html/body/#root,
  // i.e. anywhere the overlay itself is not the hit target.
  const collapseFromOverlay = (
    e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>
  ): void => {
    if (!isExpanded) return
    const target = e.target
    if (
      target === e.currentTarget ||
      !(target instanceof Node) ||
      !e.currentTarget.contains(target)
    ) {
      collapse()
    }
  }

  return (
    <div
      data-tauri-drag-region="false"
      className="flex h-[130px] w-[360px] items-center justify-center bg-transparent select-none"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={collapseFromOverlay}
      onClick={collapseFromOverlay}
    >
      <MiniIslandCard
        isExpanded={isExpanded}
        onToggleExpand={toggleExpand}
        onCollapse={collapse}
        enterKey={enterKey}
      />
    </div>
  )
}
