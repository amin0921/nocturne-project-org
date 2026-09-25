import { useEffect } from 'react'
import { seekTo, toggleMute, togglePlay, usePlayerStore } from '../stores/usePlayerStore'
import { useUIStore } from '../stores/useUIStore'

/**
 * Studio keyboard transport hotkeys (main window only — App.tsx is never
 * evaluated inside the mini-island webview thanks to the main.tsx demux).
 *
 * Bindings:
 * - Space          → toggle play/pause
 * - ArrowRight     → seek +5s (clamped to duration)
 * - ArrowLeft      → seek -5s (clamped to 0)
 * - KeyL           → toggle the Dynamic Island lyrics view
 * - KeyM           → toggle mute/unmute
 *
 * Guards:
 * - Never intercept while typing (INPUT / TEXTAREA / contentEditable).
 * - Never intercept while inside CoverFlow or modal carousels (role="listbox", [data-coverflow], .coverflow-container).
 * - Space is skipped when a native Space-activating control (button / link)
 *   holds focus, so the browser's own activation wins and play never
 *   double-toggles; Space repeats are ignored (held key = single toggle).
 * - Arrow repeats ARE allowed (held key = continuous seek).
 * - Ctrl/Cmd/Alt chords stay untouched (existing Ctrl+1 / Ctrl+2 nav).
 */
export function useStudioHotkeys(): void {
  useEffect(() => {
    const isTyping = (): boolean => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName || ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      return el instanceof HTMLElement && el.isContentEditable
    }

    const isModifierChord = (e: KeyboardEvent): boolean =>
      e.ctrlKey || e.metaKey || e.altKey

    const isCoverFlowActive = (e: KeyboardEvent): boolean => {
      if (document.activeElement?.closest('[role="listbox"], [data-coverflow], .coverflow-container')) {
        return true
      }
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[role="listbox"], [data-coverflow], .coverflow-container')) {
        return true
      }
      if (document.querySelector('[data-coverflow], .coverflow-container')) {
        return true
      }
      return false
    }

    const isCinemaStageActive = (): boolean => {
      return (
        useUIStore.getState().cinemaOpen ||
        Boolean(document.querySelector('.cinema-stage, .stage[aria-label="Cinema Stage"]'))
      )
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isTyping() || isModifierChord(e)) return
      if (isCinemaStageActive()) return
      if (document.activeElement?.closest('[role="listbox"], [data-coverflow], .coverflow-container')) return
      if (isCoverFlowActive(e)) return

      const key = e.key
      const code = e.code

      if (key === ' ' || key === 'Spacebar' || code === 'Space') {
        // Let a focused button/link handle its own native Space activation.
        const el = document.activeElement
        const nativeTag = el?.tagName || ''
        if (nativeTag === 'BUTTON' || nativeTag === 'A') return
        if (e.repeat) return
        e.preventDefault()
        togglePlay()
        return
      }

      if (code === 'ArrowRight' || key === 'ArrowRight') {
        if (isCoverFlowActive(e)) return
        const { currentTime, duration, currentTrack } = usePlayerStore.getState()
        if (!currentTrack || !duration || duration <= 0) return
        e.preventDefault()
        seekTo(Math.min(duration, currentTime + 5))
        return
      }

      if (code === 'ArrowLeft' || key === 'ArrowLeft') {
        if (isCoverFlowActive(e)) return
        const { currentTime, currentTrack } = usePlayerStore.getState()
        if (!currentTrack) return
        e.preventDefault()
        seekTo(Math.max(0, currentTime - 5))
        return
      }

      if (code === 'KeyL' || key === 'l' || key === 'L') {
        if (e.repeat) return
        e.preventDefault()
        useUIStore.getState().toggleLyrics()
        return
      }

      if (code === 'KeyM' || key === 'm' || key === 'M') {
        if (e.repeat) return
        e.preventDefault()
        toggleMute()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
