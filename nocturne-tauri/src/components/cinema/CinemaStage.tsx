import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Disc3,
  Minus,
  MicVocal,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import {
  next,
  prev,
  seekTo,
  setCurrentLyrics,
  toggleMute,
  togglePlay,
  usePlayerStore
} from '../../stores/usePlayerStore'
import { audioController } from '../../services/audio-controller'
import { resolveCoverUrl } from '../../utils/cover-url'
import { formatTime } from '../../lib/utils'
import { WindowGripPill } from '../WindowGripPill'
import { useLyricOffset } from '../../stores/useLyricOffset'
import { useIdle } from './useIdle'
import { flipEnter } from './flipEnter'
import './cinema-styles.css'

export interface CinemaStageProps {
  onClose: () => void
}

/**
 * CinemaStage Component
 * Immersive, full-bleed distraction-free listening canvas inspired by
 * Apple Music Fullscreen mode and better-lyrics.
 *
 * Features:
 * - Fullscreen atmospheric album art backdrop glow + soft radial amber emitter.
 * - Deep album art with mirror floor reflection.
 * - Synced bold (font-black 900) lyrics auto-scrolling to 37% viewport height.
 * - 2000ms idle detection: controls and mouse cursor dissolve seamlessly.
 * - Keyboard transport: Space (play/pause), Esc (exit), Left/Right (seek).
 */
export function CinemaStage({ onClose }: CinemaStageProps): JSX.Element {
  const coverRef = useRef<HTMLImageElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const currentLyrics = usePlayerStore((s) => s.currentLyrics)

  const [imgError, setImgError] = useState(false)
  const coverSrc = !imgError && currentTrack?.coverUrl ? resolveCoverUrl(currentTrack.coverUrl) : undefined

  // Per-track lyric timing calibration (ms), restored from SQLite on every
  // track change. Lyrics-clock only: effectiveTime = clockTime - offsetMs/1000
  // — audio.currentTime is never written, so a nudge cannot hitch audio.
  // One shared store feeds this stage, the Dynamic Island and LyricsPane, so
  // a ±0.5s nudge or ↺ reset written here is reflected everywhere at once.
  const trackKey = currentTrack ? String(currentTrack.id) : ''
  const { offsetMs, nudge, setOffsetMs } = useLyricOffset(trackKey)
  const handleNudge = useCallback((deltaMs: number) => nudge(deltaMs), [nudge])
  const handleReset = useCallback(() => setOffsetMs(0), [setOffsetMs])

  // Continuous 60fps clock — native timeupdate only fires ~4Hz and lets fast phrases slip
  const [clockTime, setClockTime] = useState(currentTime)
  useEffect(() => {
    if (!isPlaying) {
      setClockTime(currentTime)
      return
    }
    let rafId: number
    const tick = () => {
      const el = audioController.element
      const storeTime = usePlayerStore.getState().currentTime
      const live = Number.isFinite(el.currentTime) ? el.currentTime : storeTime
      setClockTime(live)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, currentTime])

  // 2000ms idle detection with 250ms throttling
  const isIdle = useIdle(2000, 250)

  // Smooth FLIP animation from normal stage cover to cinema cover
  useEffect(() => {
    if (coverRef.current) {
      flipEnter(coverRef.current, '[data-stage-cover="true"]')
    }
  }, [])

  // Close handler: defensively leave any native element-fullscreen (e.g. F11)
  // before closing the overlay. Stage-level fullscreen toggling was removed —
  // window bounds are owned by the shell's global window controls.
  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    }
    onClose()
  }, [onClose])

  // Purge a wrong/mismatched cached .lrc beside the current track
  const handleDeleteLyrics = useCallback(async () => {
    const track = usePlayerStore.getState().currentTrack
    const audioPath = (track?.path ?? '').trim()
    if (!audioPath) return

    let proceed = true
    try {
      const answer = window.confirm('Delete the cached lyrics file for this track?')
      proceed = answer !== false
    } catch {
      proceed = true
    }
    if (!proceed) return

    try {
      const removed = await invoke<boolean>('delete_cached_lyrics', { filePath: audioPath })
      if (removed) setCurrentLyrics([])
    } catch (err) {
      console.debug('Delete cached lyrics error:', err)
    }
  }, [])

  // Sanitize every line: coerce timestamps to numeric seconds, drop empty text, sort ascending.
  // tagOffsetMs (LRC [offset:±ms] header) rides along — line times stay RAW and
  // the header is applied once inside the sync engine below.
  const parsedLyrics = useMemo(() => {
    if (!currentLyrics || currentLyrics.length === 0) return []
    return currentLyrics
      .map((l, i) => ({
        id: i,
        time: typeof l.time === 'number' ? l.time : parseFloat(String(l.time)) || 0,
        text: l.text?.trim() || '',
        tagOffsetMs: typeof l.tagOffsetMs === 'number' && Number.isFinite(l.tagOffsetMs) ? l.tagOffsetMs : 0
      }))
      .filter((l) => l.text.length > 0)
      .sort((a, b) => a.time - b.time)
  }, [currentLyrics])

  // Match active index against the 60fps clock with offset nudge and 120ms lead-in.
  // Sync engine (Patch 137): effectiveTime = clockTime + (tagOffsetMs + userTrimMs) / 1000.
  // userTrimMs enters negated: the shared ±0.5s capsule stores positive = "lyrics later".
  const activeIdx = useMemo(() => {
    if (parsedLyrics.length === 0) return -1
    const tagOffsetMs = parsedLyrics[0]?.tagOffsetMs ?? 0
    const effectiveTime = clockTime + (tagOffsetMs - offsetMs) / 1000
    const firstLineTime = parsedLyrics[0].time
    // Early/erroneous 00:00-00:01 stamps: hold line 1 back while the intro plays.
    // Only applies to uncalibrated playback — a manual offset nudge or an
    // explicit [offset:±ms] header (intentional timing) opts out.
    const holdIntro = firstLineTime <= 1.0 && clockTime < 2.0 && offsetMs === 0 && tagOffsetMs === 0
    const threshold = holdIntro ? Math.max(0.8, firstLineTime) : firstLineTime
    if (effectiveTime < threshold) return -1
    const idx = parsedLyrics.findLastIndex((line) => line.time <= effectiveTime + 0.12)
    return idx
  }, [parsedLyrics, clockTime, offsetMs])

  // Smooth container scroll without animation collisions (replaces scrollIntoView)
  useEffect(() => {
    if (activeIdx < 0 || !lyricsContainerRef.current) return
    const container = lyricsContainerRef.current
    const activeEl =
      (container.children[activeIdx] as HTMLElement | undefined) ??
      container.querySelector<HTMLElement>(`[data-line-index="${activeIdx}"]`)
    if (!activeEl) return

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targetTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2
    container.scrollTo({ top: Math.max(0, targetTop), behavior: isReduced ? 'auto' : 'smooth' })
  }, [activeIdx])

  // Keyboard navigation & transport hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form controls
      const activeEl = document.activeElement
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl instanceof HTMLElement && activeEl.isContentEditable))
      ) {
        return
      }

      // Space: Toggle Play/Pause
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        togglePlay()
        return
      }

      // Escape: Close Cinema Stage
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        handleClose()
        return
      }

      // ArrowRight: Seek +5s
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (duration && duration > 0) {
          seekTo(Math.min(duration, currentTime + 5))
        }
        return
      }

      // ArrowLeft: Seek -5s
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        seekTo(Math.max(0, currentTime - 5))
        return
      }
    }

    // Attach in capture phase to completely isolate CinemaStage from window-level hotkeys
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleClose, duration, currentTime])

  // Metadata slot text — every fallback keeps a line occupied so the fixed-height
  // slot below the cover never changes height (zero vertical cover drift).
  const displayTitle = currentTrack?.title || 'No Track Playing'
  const displayArtist = currentTrack ? currentTrack.artist || 'Unknown Artist' : 'Select a song to start'
  const displayAlbum =
    currentTrack?.album && currentTrack.album !== 'Unknown Album' ? currentTrack.album : null

  const progressPercent = duration && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cinema Stage"
        data-idle={isIdle}
        className="stage cinema-stage font-sans"
      >
        {/* 1. Atmospheric Album Art Backdrop Glow */}
        {coverSrc && (
          <img
            src={coverSrc}
            alt=""
            aria-hidden="true"
            className="stage-glow cinema-stage-glow is-visible"
          />
        )}

        {/* 2. Soft Radial Amber Glow */}
        <div className="stage-amber cinema-stage-amber" aria-hidden="true" />

        {/* 3. Dark Radial Perimeter Vignette */}
        <div className="stage-vignette cinema-stage-vignette" aria-hidden="true" />

        {/* 4. Top Bar Chrome: Back Button, Title, Grip Pill, Unified Window Controls (Auto-hides on idle) */}
        <header className="stage-topbar select-none">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-medium transition-all group outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
              title="Back to Player (Esc)"
            >
              <ArrowLeft className="group-hover:-translate-x-0.5 transition-transform" size={14} />
              <span>Back to Player</span>
              <span className="text-[10px] text-white/30 font-mono ml-1">Esc</span>
            </button>
            <span className="font-mono text-xs tracking-widest text-white/40 hidden xl:inline">
              CINEMA STAGE
            </span>
          </div>

        <div className="flex items-center gap-3">
          <WindowGripPill label="Nocturne Cinema" className="hidden md:flex" />
          {trackKey && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono select-none">
              <button
                onClick={() => handleNudge(-500)}
                className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title="Lyrics earlier (-0.5s)"
              >
                -0.5s
              </button>
              <span className={offsetMs !== 0 ? "text-amber-400 font-bold min-w-[42px] text-center" : "text-white/40 min-w-[42px] text-center"}>
                {offsetMs === 0 ? "0.0s" : `${offsetMs > 0 ? "+" : ""}${(offsetMs / 1000).toFixed(1)}s`}
              </span>
              <button
                onClick={() => handleNudge(500)}
                className="px-1.5 py-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title="Lyrics later (+0.5s)"
              >
                +0.5s
              </button>
              {offsetMs !== 0 && (
                <button
                  onClick={handleReset}
                  className="text-[11px] text-white/40 hover:text-white ml-0.5 px-1 py-0.5 rounded hover:bg-white/10 transition-colors"
                  title="Reset offset (0.0s)"
                >
                  ↺
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => void handleDeleteLyrics()}
            title="Delete / Unlink wrong lyrics"
            className="px-2 py-0.5 rounded text-[10px] text-red-400/60 hover:text-red-400 hover:bg-white/5 transition-colors pointer-events-auto"
          >
            Wrong lyrics?
          </button>
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#121419]/90 px-1.5 py-1 backdrop-blur-xl pointer-events-auto shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Minimize Window */}
          <button
            type="button"
            onClick={async () => {
              try {
                const win = getCurrentWindow()
                await win.minimize()
              } catch (err) {
                console.debug('Window minimize error:', err)
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-ink focus-visible:outline-none"
            aria-label="Minimize window"
            title="Minimize"
          >
            <Minus size={14} aria-hidden />
          </button>

          {/* Close Cinema Stage Button */}
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-red-500/80 hover:text-white focus-visible:outline-none"
            aria-label="Close Cinema Stage (Esc)"
            title="Exit Cinema Stage (Esc)"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </header>

      {/* 5. Symmetric 50/50 Grid: Left Bay (Cover + Metadata) & Right Bay (Synced Lyrics) */}
      <main className="stage-grid">
        {/* Left 50% Bay: Cover Art & Metadata (PERMANENTLY CENTERED) */}
        <div className="flex flex-col items-center justify-center w-full px-8 select-none overflow-visible">
          <div className="stage-art-wrap overflow-visible">
            {coverSrc ? (
              <img
                ref={coverRef}
                src={coverSrc}
                alt={currentTrack?.title ?? 'Album Cover'}
                draggable={false}
                onError={() => setImgError(true)}
                className="stage-art select-none"
              />
            ) : (
              <div className="stage-art flex items-center justify-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
                <Disc3 size={64} className="text-muted/40 animate-spin-slow" />
              </div>
            )}
          </div>

          {/* Track Title and Artist below reflection — hard-capped so long titles truncate.
              Fixed min-height slot + album placeholder: the cover's vertical anchor is
              pixel-identical for full-tag and unknown/missing-metadata tracks. */}
          <div className="mt-8 flex flex-col items-center justify-start text-center min-h-[84px] max-w-[min(36vw,420px)] px-4">
            <h1
              dir="auto"
              title={displayTitle}
              className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] truncate max-w-full"
            >
              {displayTitle}
            </h1>
            <p
              dir="auto"
              title={displayArtist}
              className="mt-1 text-base sm:text-lg font-medium text-slate-300/90 drop-shadow-md truncate max-w-full"
            >
              {displayArtist}
            </p>
            {displayAlbum ? (
              <p
                dir="auto"
                title={displayAlbum}
                className="mt-1 text-xs text-slate-400/60 font-mono truncate max-w-full"
              >
                {displayAlbum}
              </p>
            ) : (
              <div className="mt-1 h-4" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Right 50% Bay: Synced Bold Lyrics (fixed max-width, isolated from left bay) */}
        <div className="flex items-center justify-center w-full px-8">
          <section
            className="stage-lyrics w-full max-w-[520px]"
            ref={lyricsContainerRef}
            aria-label="Synchronized lyrics"
          >
            {parsedLyrics && parsedLyrics.length > 0 ? (
              parsedLyrics.map((line, idx) => {
                const isActive = idx === activeIdx
                return (
                  <p
                    key={`lyric-${line.id ?? idx}`}
                    data-line-index={idx}
                    data-active={isActive}
                    dir="auto"
                    onClick={() => seekTo(Math.max(0, line.time - (line.tagOffsetMs ?? 0) / 1000))}
                    className="lyric-line"
                  >
                    {line.text}
                  </p>
                )
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400">
                  <MicVocal size={32} />
                </span>
                <p className="text-xl font-bold text-white/90">
                  No Synchronized Lyrics
                </p>
                <p className="text-sm text-slate-400 max-w-sm">
                  No synchronized lyrics file (.lrc) found for this track. Enjoy the instrumental audio atmosphere.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* 6. Bottom Chrome Bar: Scrubber + Controls (Auto-hides on idle) */}
      <footer className="stage-chrome">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#121419]/85 p-3 sm:p-4 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
          {/* Progress Seek Bar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] font-mono numeric text-slate-400 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <div
              className="relative flex-1 h-2 rounded-full bg-white/10 overflow-hidden cursor-pointer group"
              onClick={(e) => {
                if (!duration || duration <= 0) return
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const ratio = Math.max(0, Math.min(1, clickX / rect.width))
                seekTo(ratio * duration)
              }}
            >
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-75 relative group-hover:brightness-110"
                style={{ width: `${progressPercent}%` }}
              >
                <span className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-[11px] font-mono numeric text-slate-500 w-10">
              {formatTime(duration)}
            </span>
          </div>

          {/* Transport Controls & Volume (Strict Dead-Center Anchoring) */}
          <div className="relative flex items-center justify-between w-full px-2 py-1 min-h-[56px]">
            {/* Left Column: Fixed 1/3 width, truncated status */}
            <div className="w-1/3 flex items-center gap-3 min-w-0">
              <span className="text-xs text-white/50 font-mono tracking-wider uppercase truncate select-none">
                {isPlaying ? 'Playing' : 'Paused'}
              </span>
            </div>

            {/* Center Column: STRICT DEAD CENTER (Immune to left/right sibling widths) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 sm:gap-5 pointer-events-auto">
              {/* Prev */}
              <button
                type="button"
                onClick={() => void prev()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition-colors active:scale-95"
                aria-label="Previous track"
                title="Previous Track"
              >
                <SkipBack size={20} />
              </button>

              {/* Rock-solid, zero-jitter Play / Pause button */}
              <button
                type="button"
                onClick={() => togglePlay()}
                className="w-14 h-14 rounded-full shrink-0 aspect-square flex items-center justify-center bg-[#f59e0b] text-[#0D0F15] shadow-[0_0_24px_rgba(245,158,11,0.45)] hover:brightness-105 transition-colors focus-visible:outline-none select-none"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                aria-pressed={isPlaying}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <Pause size={22} fill="currentColor" />
                ) : (
                  <Play size={22} fill="currentColor" />
                )}
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={() => void next()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition-colors active:scale-95"
                aria-label="Next track"
                title="Next Track"
              >
                <SkipForward size={20} />
              </button>
            </div>

            {/* Right Column: Volume / auxiliary controls */}
            <div className="w-1/3 flex items-center justify-end gap-3 min-w-0">
              <button
                type="button"
                onClick={() => toggleMute()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted ? <VolumeX size={16} className="text-amber-500" /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </>
  )
}

export default CinemaStage
