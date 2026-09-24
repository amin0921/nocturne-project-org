import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MicVocal } from 'lucide-react'
import { usePlayerStore, seekTo } from '../stores/usePlayerStore'
import { parseLrc, type LyricLine, type LyricWord } from '../utils/lrcParser'
import { fetchLyricsOnline } from '../services/lyricsService'
import { cn } from '../lib/utils'

export type { LyricLine, LyricWord }
export { parseLrc }

export interface LyricsPaneProps {
  lyrics?: LyricLine[] | string | null
  /** True while the Dynamic Island canvas is expanded — triggers timed re-centering. */
  active?: boolean
  /** Per-track manual calibration (seconds, ±) added to line timestamps. */
  manualOffset?: number
  className?: string
}

interface LyricLineRowProps {
  line: LyricLine
  isActive: boolean
  distance: number
  onSeek: (time: number) => void
}

const LyricLineRow = React.memo(function LyricLineRow({
  line,
  isActive,
  distance,
  onSeek
}: LyricLineRowProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSeek(line.time)}
      className={cn(
        'group w-full cursor-pointer py-1.5 px-3 rounded-xl text-left outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]',
        'lyric-line-motion space-y-3 py-1.5 leading-snug origin-left',
        isActive
          ? 'lyric-line-active-solid text-[#f59e0b] text-xl md:text-2xl font-black scale-[1.02]'
          : distance === 1
          ? 'lyric-line-neighbor text-white/50 text-base md:text-lg font-bold scale-100 hover:text-white/80'
          : 'lyric-line-distant text-white/28 text-base md:text-lg font-medium scale-100 hover:text-white/60'
      )}
      aria-current={isActive ? 'true' : undefined}
    >
      <span dir="auto" className="inline-block max-w-full leading-snug">
        {line.text || '•••'}
      </span>
    </button>
  )
}, (previous, next) => {
  if (previous.isActive !== next.isActive) return false
  if (previous.distance !== next.distance) {
    if (!(previous.distance >= 2 && next.distance >= 2)) {
      return false
    }
  }
  if (previous.line.text !== next.line.text) return false
  if (previous.line.time !== next.line.time) return false
  return previous.onSeek === next.onSeek
})

/**
 * LyricsPane Component
 * Dedicated studio lyrics view for the right island (320px column) & stage canvas.
 * Features:
 * - 1st: Local .lrc lookup beside audio file via Tauri IPC 'get_lyrics'
 * - 2nd: Automatic fallback fetch from LRCLIB API with query sanitizer
 * - 3rd: Background caching of fetched lyrics to sibling .lrc via 'save_cached_lyrics'
 * - Real-time synchronization to usePlayerStore.currentTime
 * - Optical Center Lock: Active lyric line is continuously centered vertically (scrollIntoView block: "center")
 * - Floating Viewport Spacer Padding: 36vh top/bottom padding gives lines 0 to end full centering travel
 * - Cinematic Vignette Fade Mask (.lyrics-vignette-mask): GPU mask fades top/bottom into obsidian void
 * - Visual Depth Hierarchy:
 *     * Active: Studio Amber (#f59e0b), font-black (900), scale-[1.02], amber drop shadow
 *     * Immediate neighbors (distance 1): text-white/50, font-bold
 *     * Distant (distance >= 2): text-white/28, font-medium
 * - Manual scroll throttle: 2.5s pause on wheel/touch/scroll so user interaction isn't fought
 * - Click-to-seek playback navigation
 * - Track change: instant scroll reset to top, then center the new opening line
 * - Expand (active prop): 420ms settle delay avoids layout thrashing mid-island morph
 * - Preserves Vazirmatn variable font for Persian lyrics and Inter for Latin lyrics with dir="auto"
 */
export function LyricsPane({
  lyrics: propsLyrics,
  active,
  manualOffset = 0,
  className
}: LyricsPaneProps): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentLyrics = usePlayerStore((s) => s.currentLyrics)

  const [fetchedLyrics, setFetchedLyrics] = useState<LyricLine[]>([])
  const [isSearching, setIsSearching] = useState(false)
  // False only during the expand morph (until transition end at 420ms):
  // gates pointer events on the scroll container so hover/hit-testing never
  // runs while the island's width/height are still interpolating.
  const [isDocked, setIsDocked] = useState(true)

  // Fetch sibling .lrc file or query LRCLIB if no explicit lyrics prop is passed
  useEffect(() => {
    if (propsLyrics !== undefined) {
      if (typeof propsLyrics === 'string') {
        const parsed = parseLrc(propsLyrics)
        setFetchedLyrics(parsed)
        usePlayerStore.getState().setCurrentLyrics(parsed)
      } else if (Array.isArray(propsLyrics)) {
        setFetchedLyrics(propsLyrics)
        usePlayerStore.getState().setCurrentLyrics(propsLyrics)
      }
      return
    }

    // If usePlayerStore already populated currentLyrics, use them immediately
    if (currentLyrics.length > 0) {
      setIsSearching(false)
      return
    }

    const rawPath =
      (currentTrack as any)?.file_path ||
      (typeof (currentTrack as any)?.id === 'string' &&
      ((currentTrack as any)?.id.includes('/') || (currentTrack as any)?.id.includes('\\'))
        ? (currentTrack as any)?.id
        : null) ||
      currentTrack?.path ||
      (typeof (currentTrack as any)?.id === 'string' ? (currentTrack as any)?.id : '')
    const trackPath = typeof rawPath === 'string' ? rawPath.trim() : ''

    if (!trackPath || !currentTrack) {
      setFetchedLyrics([])
      return
    }

    let isCancelled = false
    setIsSearching(true)

    // Step 1: Check local sibling .lrc
    invoke<string | null>('get_lyrics', { filePath: trackPath })
      .then(async (localLrc) => {
        if (isCancelled) return

        if (localLrc && localLrc.trim().length > 0) {
          const parsed = parseLrc(localLrc)
          if (parsed.length > 0) {
            setFetchedLyrics(parsed)
            usePlayerStore.getState().setCurrentLyrics(parsed)
            setIsSearching(false)
            return
          }
        }

        // Step 2: Fallback to online LRCLIB API
        if (currentTrack.title) {
          // Strict edition matching: prefer the scanner's duration, else the
          // live audio-element duration once metadata has loaded.
          const liveDuration = usePlayerStore.getState().duration
          const onlineLrc = await fetchLyricsOnline(
            currentTrack.title,
            currentTrack.artist || '',
            currentTrack.duration_secs ?? liveDuration ?? undefined
          )

          if (isCancelled) return

          if (onlineLrc && onlineLrc.trim().length > 0) {
            const parsed = parseLrc(onlineLrc)
            setFetchedLyrics(parsed)
            usePlayerStore.getState().setCurrentLyrics(parsed)

            // Step 3: Background cache to sibling .lrc file for future offline use
            invoke('save_cached_lyrics', { filePath: trackPath, content: onlineLrc })
              .catch((err) => {
                console.warn('Could not cache downloaded lyrics to disk:', err)
              })

            setIsSearching(false)
            return
          }
        }

        // If neither local nor online yielded lyrics
        setFetchedLyrics([])
        setIsSearching(false)
      })
      .catch((err) => {
        console.warn('Failed to resolve lyrics for track:', trackPath, err)
        if (!isCancelled) {
          setFetchedLyrics([])
          setIsSearching(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [currentTrack?.path, (currentTrack as any)?.file_path, currentTrack?.title, currentTrack?.artist, propsLyrics, currentLyrics.length])

  // Compute final parsed lines
  const parsedLines = useMemo<LyricLine[]>(() => {
    if (propsLyrics !== undefined) {
      if (!propsLyrics) return []
      if (typeof propsLyrics === 'string') {
        return parseLrc(propsLyrics)
      }
      return propsLyrics
    }
    return fetchedLyrics.length > 0 ? fetchedLyrics : currentLyrics
  }, [propsLyrics, fetchedLyrics, currentLyrics])

  // Determine current active lyric line based on playback currentTime.
  // manualOffset (user fine-tune) is added to each line's timestamp so a nudge
  // takes effect instantly without re-parsing the LRC.
  const activeIndex = useMemo(() => {
    if (parsedLines.length === 0) return -1
    let idx = -1
    for (let i = 0; i < parsedLines.length; i++) {
      if (parsedLines[i].time + manualOffset <= currentTime) {
        idx = i
      } else {
        break
      }
    }
    return idx
  }, [parsedLines, currentTime, manualOffset])

  const userScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const lastTimeRef = useRef(currentTime)
  const programmaticRef = useRef(false)
  const programmaticTimerRef = useRef<number | null>(null)
  const dockedRef = useRef(true)

  const unlockAutoScroll = useCallback(() => {
    userScrollingRef.current = false
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = null
    }
  }, [])

  const beginProgrammaticScroll = useCallback(() => {
    programmaticRef.current = true
    if (programmaticTimerRef.current !== null) {
      window.clearTimeout(programmaticTimerRef.current)
    }
    programmaticTimerRef.current = window.setTimeout(() => {
      programmaticRef.current = false
    }, 900)
  }, [])

  const centerActiveLine = useCallback((behavior?: ScrollBehavior) => {
    if (!dockedRef.current) return
    const el = scrollContainerRef.current?.querySelector('button[aria-current="true"]') as HTMLButtonElement | null
    if (!el) return
    beginProgrammaticScroll()
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const resolvedBehavior: ScrollBehavior =
      behavior ?? (prefersReduced ? 'auto' : 'smooth')
    el.scrollIntoView({ behavior: resolvedBehavior, block: 'center' })
  }, [beginProgrammaticScroll])

  // Track change: instantly reset container scroll to the top of the new track
  // and release any stale manual-scroll lock.
  useEffect(() => {
    unlockAutoScroll()
    if (scrollContainerRef.current) {
      beginProgrammaticScroll()
      scrollContainerRef.current.scrollTop = 0
    }
  }, [currentTrack?.id, unlockAutoScroll, beginProgrammaticScroll])

  // New lyrics payload arrived (track change or late LRCLIB/local fetch):
  // reset to top and center the opening/active line — covers the case where
  // activeIndex stays numerically equal across tracks (effect below wouldn't fire).
  useEffect(() => {
    unlockAutoScroll()
    if (scrollContainerRef.current) {
      beginProgrammaticScroll()
      scrollContainerRef.current.scrollTop = 0
    }
    const frame = requestAnimationFrame(() => {
      centerActiveLine('auto')
    })
    return () => cancelAnimationFrame(frame)
  }, [parsedLines, unlockAutoScroll, beginProgrammaticScroll, centerActiveLine])

  // Transition-end scroll gating: while the island morphs (380ms), any
  // scrollIntoView forces a synchronous DOM layout on wrapped lyric lines and
  // makes Chromium drop frames at the ~80-95% mark (visible "game-lag" snap).
  // Wait 420ms — past full settle of every 380ms geometry transition — then
  // re-center silently. The scroll container stays pointer-events-none for
  // the whole window to avoid spurious hover/hit-test work mid-morph.
  useEffect(() => {
    if (!active) {
      dockedRef.current = true
      setIsDocked(true)
      return
    }
    dockedRef.current = false
    setIsDocked(false)
    const timer = window.setTimeout(() => {
      unlockAutoScroll()
      dockedRef.current = true
      setIsDocked(true)
      centerActiveLine('smooth')
    }, 420)
    return () => window.clearTimeout(timer)
  }, [active, unlockAutoScroll, centerActiveLine])

  // Post-seek sync: a playback-time discontinuity means an external seek
  // (bottom bar, keyboard). Re-center immediately, bypassing the manual lock.
  useEffect(() => {
    const prev = lastTimeRef.current
    lastTimeRef.current = currentTime
    const jump = Math.abs(currentTime - prev)
    const threshold = isPlaying ? 0.6 : 0.01
    if (jump < threshold) return
    unlockAutoScroll()
    centerActiveLine('smooth')
  }, [currentTime, isPlaying, unlockAutoScroll, centerActiveLine])

  // Smoothly center the active lyric line when activeIndex changes (playback tick)
  useEffect(() => {
    if (userScrollingRef.current) return
    centerActiveLine()
  }, [activeIndex, centerActiveLine])

  const handleManualScrollActivity = useCallback(() => {
    programmaticRef.current = false
    userScrollingRef.current = true
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      userScrollingRef.current = false
      if (usePlayerStore.getState().isPlaying) {
        centerActiveLine()
      }
    }, 2500)
  }, [centerActiveLine])

  const handleScroll = useCallback(() => {
    // Ignore scroll events caused by our own scrollIntoView / scrollTop resets.
    if (programmaticRef.current) return
    handleManualScrollActivity()
  }, [handleManualScrollActivity])

  const handleWheel = useCallback(() => {
    handleManualScrollActivity()
  }, [handleManualScrollActivity])

  const handleTouchMove = useCallback(() => {
    handleManualScrollActivity()
  }, [handleManualScrollActivity])

  // Handle click-to-seek navigation (seek to the calibrated line time)
  const handleSeek = useCallback((time: number) => {
    unlockAutoScroll()
    const target = Math.max(0, time + manualOffset)
    const storeState = usePlayerStore.getState() as any
    if (typeof storeState.seek === 'function') {
      storeState.seek(target)
    } else {
      seekTo(target)
    }
  }, [manualOffset, unlockAutoScroll])

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
      if (programmaticTimerRef.current !== null) {
        window.clearTimeout(programmaticTimerRef.current)
      }
    }
  }, [])

  if (!currentTrack) {
    return (
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-6 text-center select-none overflow-hidden', className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-faint mb-3 shadow-inner">
          <MicVocal size={22} className="text-[#EAB308]/70" />
        </div>
        <p className="text-xs font-semibold text-ink">No Track Selected</p>
        <p className="text-[11px] text-faint mt-1 max-w-[220px] leading-relaxed">
          Select or play a song to view synchronized lyrics.
        </p>
      </div>
    )
  }

  if (isSearching && parsedLines.length === 0) {
    return (
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-6 text-center select-none overflow-hidden', className)}>
        <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-[#EAB308] animate-spin mb-3" />
        <p className="text-[11px] text-slate-400 font-mono tracking-tight">Searching lyrics...</p>
      </div>
    )
  }

  if (parsedLines.length === 0) {
    return (
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-6 text-center select-none overflow-hidden', className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-faint mb-3 shadow-[0_0_15px_rgba(234,179,8,0.06)]">
          <MicVocal size={22} className="text-[#EAB308]/80" />
        </div>
        <p className="text-xs font-semibold text-ink">No Synchronized Lyrics</p>
        <p className="text-[11px] text-faint mt-1 max-w-[240px] leading-relaxed">
          No synchronized lyrics found for this track. Place a matching <code className="text-[#EAB308] font-mono text-[10px]">.lrc</code> file beside your audio.
        </p>
        <div className="mt-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-400 font-mono">
          <span className="truncate max-w-[200px]" dir="auto">{currentTrack.title}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      style={{
        paddingTop: '36vh',
        paddingBottom: '36vh'
      }}
      className={cn(
        'lyrics-vignette-mask flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto space-y-3 px-6 text-left select-none',
        !isDocked && 'pointer-events-none',
        className
      )}
      role="region"
      aria-label="Synchronized lyrics"
    >
      {parsedLines.map((line, idx) => {
        const distance = activeIndex >= 0 ? Math.abs(idx - activeIndex) : 999
        return (
          <LyricLineRow
            key={`${line.time}-${line.id ?? idx}`}
            line={line}
            isActive={idx === activeIndex}
            distance={distance}
            onSeek={handleSeek}
          />
        )
      })}
    </div>
  )
}

export default LyricsPane
