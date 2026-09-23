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
  onSeek: (time: number) => void
}

const LyricLineRow = React.memo(function LyricLineRow({
  line,
  isActive,
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
          ? 'lyric-line-active-solid text-xl md:text-2xl font-black scale-[1.06]'
          : 'lyric-line-inactive text-base md:text-lg font-bold scale-100'
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
  if (previous.line.text !== next.line.text) return false
  if (previous.line.time !== next.line.time) return false
  return previous.onSeek === next.onSeek
})

/**
 * LyricsPane Component
 * Dedicated studio lyrics view for the right island (320px column).
 * Features:
 * - 1st: Local .lrc lookup beside audio file via Tauri IPC 'get_lyrics'
 * - 2nd: Automatic fallback fetch from LRCLIB API with query sanitizer
 * - 3rd: Background caching of fetched lyrics to sibling .lrc via 'save_cached_lyrics'
 * - Real-time synchronization to usePlayerStore.currentTime
 * - Smooth auto-scrolling with active row amber glow highlighting
 * - Click-to-seek playback navigation
 * - Track change: instant scroll reset to top, then center the new opening line
 * - Expand (active prop): scroll container is pointer-events-none while the
 *   380ms island morph runs (no hover/hit-test mid-morph); re-centers the
 *   active line at 420ms — strictly after transition end — so scroll/layout
 *   recalculation never forces a synchronous reflow mid-interpolation
 * - External seek: immediate lock-free re-center (bottom bar / keyboard)
 * - Programmatic scroll awareness: auto-center never re-locks the user-scroll guard
 * - Progressive edge mask (.lyrics-mask)
 * - Strict anti-jitter geometry (min-h-0 min-w-0 flex flex-col overflow-hidden)
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

  const [fetchedLyrics, setFetchedLyrics] = useState<LyricLine[]>([])
  const [isSearching, setIsSearching] = useState(false)
  // False only during the expand morph (until transition end at 420ms):
  // gates pointer events on the scroll container so hover/hit-testing never
  // runs while the island's width/height are still interpolating.
  const [isDocked, setIsDocked] = useState(true)

  // Fetch sibling .lrc file or query LRCLIB if no explicit lyrics prop is passed
  useEffect(() => {
    if (propsLyrics !== undefined) {
      return
    }

    const trackPath = currentTrack?.path || (currentTrack as any)?.file_path
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
  }, [currentTrack?.path, (currentTrack as any)?.file_path, currentTrack?.title, currentTrack?.artist, propsLyrics])

  // Compute final parsed lines
  const parsedLines = useMemo<LyricLine[]>(() => {
    if (propsLyrics !== undefined) {
      if (!propsLyrics) return []
      if (typeof propsLyrics === 'string') {
        return parseLrc(propsLyrics)
      }
      return propsLyrics
    }
    return fetchedLyrics
  }, [propsLyrics, fetchedLyrics])

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

  const unlockAutoScroll = () => {
    userScrollingRef.current = false
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = null
    }
  }

  const beginProgrammaticScroll = () => {
    programmaticRef.current = true
    if (programmaticTimerRef.current !== null) {
      window.clearTimeout(programmaticTimerRef.current)
    }
    programmaticTimerRef.current = window.setTimeout(() => {
      programmaticRef.current = false
    }, 900)
  }

  const centerActiveLine = (behavior: ScrollBehavior = 'smooth') => {
    if (!dockedRef.current) return
    const el = scrollContainerRef.current?.querySelector('button[aria-current="true"]') as HTMLButtonElement | null
    if (!el) return
    beginProgrammaticScroll()
    el.scrollIntoView({ behavior, block: 'center' })
  }

  // Track change: instantly reset container scroll to the top of the new track
  // and release any stale manual-scroll lock.
  useEffect(() => {
    unlockAutoScroll()
    if (scrollContainerRef.current) {
      beginProgrammaticScroll()
      scrollContainerRef.current.scrollTop = 0
    }
  }, [currentTrack?.id])

  // New lyrics payload arrived (track change or late LRCLIB/local fetch):
  // reset to top and center the opening/active line — covers the case where
  // activeIndex stays numerically equal across tracks (effect below wouldn't fire).
  useEffect(() => {
    unlockAutoScroll()
    if (scrollContainerRef.current) {
      beginProgrammaticScroll()
      scrollContainerRef.current.scrollTop = 0
    }
    centerActiveLine()
  }, [parsedLines])

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
      centerActiveLine()
    }, 420)
    return () => window.clearTimeout(timer)
  }, [active])

  // Post-seek sync: a playback-time discontinuity means an external seek
  // (bottom bar, keyboard). Re-center immediately, bypassing the manual lock.
  useEffect(() => {
    const prev = lastTimeRef.current
    lastTimeRef.current = currentTime
    const jump = Math.abs(currentTime - prev)
    const threshold = isPlaying ? 0.6 : 0.01
    if (jump < threshold) return
    unlockAutoScroll()
    centerActiveLine()
  }, [currentTime, isPlaying])

  // Smoothly center the active lyric line when activeIndex changes (playback tick)
  useEffect(() => {
    if (userScrollingRef.current) return
    centerActiveLine()
  }, [activeIndex])

  const handleScroll = () => {
    // Ignore scroll events caused by our own scrollIntoView / scrollTop resets.
    if (programmaticRef.current) return
    userScrollingRef.current = true
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = window.setTimeout(() => {
      userScrollingRef.current = false
    }, 2500)
  }

  // Handle click-to-seek navigation (seek to the calibrated line time)
  const handleSeek = useCallback((time: number) => {
    const target = Math.max(0, time + manualOffset)
    const storeState = usePlayerStore.getState() as any
    if (typeof storeState.seek === 'function') {
      storeState.seek(target)
    } else {
      seekTo(target)
    }
  }, [manualOffset])

  // Fallback progressive edge blur mask style
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
  }

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
      style={maskStyle}
      className={cn(
        'lyrics-mask nocturne-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto space-y-3 px-6 py-32 text-left select-none',
        !isDocked && 'pointer-events-none',
        className
      )}
      role="region"
      aria-label="Synchronized lyrics"
    >
      {parsedLines.map((line, idx) => (
        <LyricLineRow
          key={`${line.time}-${line.id ?? idx}`}
          line={line}
          isActive={idx === activeIndex}
          onSeek={handleSeek}
        />
      ))}
    </div>
  )
}

export default LyricsPane
