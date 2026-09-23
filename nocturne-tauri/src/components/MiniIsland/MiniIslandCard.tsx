import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, Disc3, SkipBack, SkipForward } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PlayPauseButton } from '../PlayPauseButton'
import { EqBars } from '../EqBars'
import { sendCommand, useMiniPlayerStore } from '../../stores/useMiniPlayerStore'
import { resolveCoverUrl } from '../../utils/cover-url'
import { cn, formatTime } from '../../lib/utils'

export interface MiniIslandCardProps {
  isExpanded: boolean
  onToggleExpand: () => void
  /** Reveal counter from MiniIslandApp — each bump plays the droplet entry. */
  enterKey?: number
}

const TAP_MAX_DISTANCE_PX = 5
const TAP_MAX_ELAPSED_MS = 300

/**
 * MiniIslandCard — floating desktop Dynamic Island (Step 80).
 * Single morphing container springs width/height/border-radius between a
 * 140x36 collapsed pill and a 340x114 expanded card via the baked
 * --island-spring linear() curve (stiffness 500 / damping 40 / mass 1),
 * transform-origin center top, with superellipse-pill/card G2 squircle
 * progressive enhancement. Inner layers crossfade with the spec'd
 * opacity+scale choreography (out: duration-150; in: duration-300 delay-75).
 *
 * Drag/tap disambiguation (Windows/Tauri upstream constraint, see #10767):
 * once native data-tauri-drag-region auto-fires start_dragging on mousedown,
 * the OS caption-drag loop eats pointerup — so the native auto-start is
 * intercepted on the collapsed pill and DEFERRED until pointer movement
 * crosses 5px (manual startDragging, Tauri's documented pattern). Taps never
 * invoke native drag, so pointerUp always arrives: distance < 5px &&
 * elapsed < 300ms toggles the island; distance >= 5px is a window drag.
 * The bare data-tauri-drag-region attribute stays on the pill element;
 * interactive controls opt out with data-tauri-drag-region="false".
 */
export function MiniIslandCard({
  isExpanded,
  onToggleExpand,
  enterKey = 0
}: MiniIslandCardProps): JSX.Element {
  const isPlaying = useMiniPlayerStore((s) => s.isPlaying)
  const currentTime = useMiniPlayerStore((s) => s.currentTime)
  const duration = useMiniPlayerStore((s) => s.duration)
  const track = useMiniPlayerStore((s) => s.track)

  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const dragStarted = useRef(false)

  // Liquid-droplet entrance (Step 83): armed once per reveal (enterKey bump),
  // only when the pill is collapsed; self-clears on animation end so the
  // inline translateZ(0) GPU-layer pin and WebKit mask resume afterwards
  // without the fill-mode keyframes lingering. animationName guards against
  // bubbling child animations (EQ bars, capsule pulse). Expanding mid-entry
  // consumes the reveal (ref advanced) and clears the droplet immediately.
  const [droplet, setDroplet] = useState(false)
  const lastEnterKeyRef = useRef(enterKey)

  useEffect(() => {
    const revealed = enterKey !== lastEnterKeyRef.current
    if (revealed) lastEnterKeyRef.current = enterKey
    if (isExpanded) {
      setDroplet(false)
      return
    }
    if (revealed) setDroplet(true)
  }, [enterKey, isExpanded])

  const settleDroplet = (e: React.AnimationEvent): void => {
    if (e.animationName === 'liquid-droplet-in') setDroplet(false)
  }

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.stopPropagation()
  }

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (isExpanded || e.button !== 0) return
    pointerStart.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    dragStarted.current = false
  }

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (isExpanded || dragStarted.current || !pointerStart.current) return
    const distance = Math.hypot(
      e.clientX - pointerStart.current.x,
      e.clientY - pointerStart.current.y
    )
    if (distance >= TAP_MAX_DISTANCE_PX) {
      dragStarted.current = true
      void getCurrentWindow()
        .startDragging()
        .catch(() => undefined)
    }
  }

  const handlePointerUp = (e: React.PointerEvent): void => {
    if (isExpanded) return
    const start = pointerStart.current
    const wasDrag = dragStarted.current
    pointerStart.current = null
    dragStarted.current = false
    if (wasDrag || !start) return
    const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    const elapsed = performance.now() - start.t
    if (distance < TAP_MAX_DISTANCE_PX && elapsed < TAP_MAX_ELAPSED_MS) {
      onToggleExpand()
    }
  }

  const handlePointerCancel = (): void => {
    pointerStart.current = null
    dragStarted.current = false
  }

  const handleScrub = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!duration || duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    sendCommand('seek', frac * duration)
  }

  const cover = resolveCoverUrl(track?.coverUrl)
  const progressPct =
    duration && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const hasTrack = track !== null
  const remaining = duration !== null && duration > 0 ? duration - currentTime : null

  return (
    <div
      className={cn(
        'relative shrink-0 select-none overflow-hidden bg-[#0D0F15] border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transform-gpu',
        isExpanded
          ? 'superellipse-card w-[340px] h-[114px] rounded-[38px]'
          : 'superellipse-pill w-[140px] h-9 rounded-[18px]',
        !isExpanded && isPlaying && 'island-capsule-pulse',
        droplet && !isExpanded && 'animate-liquid-droplet'
      )}
      onAnimationEnd={settleDroplet}
      style={{
        isolation: 'isolate',
        contain: 'layout style',
        transformOrigin: 'center top',
        transition: 'all 420ms var(--island-spring)',
        willChange: 'width, height',
        /* GPU anti-aliased clip anchor: the -webkit-radial-gradient mask hack
           forces Blink to keep a continuous hardware-AA radius mask on the
           morphing layer; translateZ(0) pins it as an isolated composited
           layer so the clip is never torn down (1-frame square flash) at
           transition end. Radius math: 18px <-> 38px stays positive through
           the whole --island-spring overshoot (peak ~39.1px), never clamping
           to 0px the way 9999px -> 38px interpolation did. */
        transform: 'translateZ(0)',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)'
      }}
    >
      {/* Layer 1: Collapsed pill. Native drag region (deferred to 5px move);
          pointerUp tap (<5px, <300ms) toggles the island. */}
      <div
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={cn(
          'absolute inset-0 flex cursor-pointer items-center gap-2 px-2.5 rounded-[18px] transform-gpu transition-all [transition-timing-function:var(--island-spring)]',
          isExpanded
            ? 'opacity-0 scale-95 pointer-events-none duration-150 delay-0'
            : 'opacity-100 scale-100 pointer-events-auto duration-300 delay-75'
        )}
        role="button"
        tabIndex={isExpanded ? -1 : 0}
        aria-expanded={isExpanded}
        aria-label="Toggle mini player"
        onKeyDown={(e) => {
          if (!isExpanded && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onToggleExpand()
          }
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            draggable={false}
            className="h-6 w-6 shrink-0 rounded-md border border-white/10 object-cover"
          />
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 bg-raised">
            <Disc3 size={12} className="text-faint/70" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
          {track?.title ?? 'Nocturne'}
        </span>
        {/* Zero-CPU 3-bar micro equalizer (Step 76 classes) */}
        <span aria-hidden className="flex h-[10px] shrink-0 items-end gap-[2px]">
          {[1, 2, 3].map((bar) => (
            <span
              key={bar}
              className={cn(
                'island-eq-bar w-[2px] h-[10px] rounded-full bg-ember',
                isPlaying && `island-eq-bar-${bar}`
              )}
            />
          ))}
        </span>
      </div>

      {/* Layer 2: Expanded transport rows — deep-drag background/title row;
          interactive controls opt out with data-tauri-drag-region="false". */}
      <div
        data-tauri-drag-region="deep"
        className={cn(
          'absolute inset-0 flex h-full flex-col justify-center gap-1.5 px-4 rounded-[34px] transform-gpu transition-all [transition-timing-function:var(--island-spring)]',
          isExpanded
            ? 'opacity-100 scale-100 pointer-events-auto duration-300 delay-75'
            : 'opacity-0 scale-95 pointer-events-none duration-150 delay-0'
        )}
        aria-hidden={!isExpanded}
      >
        {/* Row 1: artwork + title/artist + equalizer + collapse (~40px) */}
        <div data-tauri-drag-region="deep" className="flex h-10 min-w-0 shrink-0 items-center gap-3">
          {cover ? (
            <img
              src={cover}
              alt=""
              draggable={false}
              className="h-10 w-10 shrink-0 rounded-xl border border-white/10 object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-raised">
              <Disc3 size={18} className="text-faint/70" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">
              {track?.title ?? 'Nothing playing'}
            </p>
            <p className="truncate text-[11px] text-muted">
              {track?.artist ?? 'Add a folder in the main window'}
            </p>
          </div>
          {hasTrack && <EqBars isPlaying={isPlaying} className="shrink-0" />}
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={onToggleExpand}
            title="Collapse"
            aria-label="Collapse mini player"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:bg-white/10 hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>

        {/* Row 2: mono times + scrubber (~16px) — scrubber opts out of drag */}
        <div className="flex h-4 shrink-0 items-center gap-2">
          <span className="numeric w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-faint">
            {formatTime(currentTime)}
          </span>
          <div
            role="presentation"
            data-tauri-drag-region="false"
            onPointerDown={handleScrub}
            className="relative h-1 min-w-0 flex-1 cursor-pointer rounded-full bg-white/10"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-ember"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="numeric w-8 shrink-0 font-mono text-[10px] tabular-nums text-faint">
            {remaining !== null ? `-${formatTime(remaining)}` : '--:--'}
          </span>
        </div>

        {/* Row 3: transport controls (~32px) */}
        <div className="flex h-8 shrink-0 items-center justify-center gap-5">
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={() => sendCommand('prev')}
            disabled={!hasTrack}
            title="Previous"
            aria-label="Previous track"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 disabled:opacity-40 disabled:pointer-events-none"
          >
            <SkipBack size={15} aria-hidden />
          </button>
          <PlayPauseButton
            isPlaying={isPlaying}
            onClick={() => sendCommand('togglePlay')}
            disabled={!hasTrack}
            className="h-8 w-8 cursor-pointer"
          />
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={() => sendCommand('next')}
            disabled={!hasTrack}
            title="Next"
            aria-label="Next track"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 disabled:opacity-40 disabled:pointer-events-none"
          >
            <SkipForward size={15} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

export default MiniIslandCard
