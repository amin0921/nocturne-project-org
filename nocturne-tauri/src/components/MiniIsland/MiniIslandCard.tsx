import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, Disc3, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { EqBars } from '../EqBars'
import { sendCommand, useMiniPlayerStore } from '../../stores/useMiniPlayerStore'
import { resolveCoverUrl } from '../../utils/cover-url'
import { cn, formatTime } from '../../lib/utils'

export interface MiniIslandCardProps {
  isExpanded: boolean
  onToggleExpand: () => void
  /** Hard collapse trigger (MiniIslandApp) — chevron + corner presses call this
   *  directly instead of toggling, so an expanded card can never re-expand. */
  onCollapse?: () => void
  /** Reveal counter from MiniIslandApp — each bump plays the droplet entry. */
  enterKey?: number
}

const TAP_MAX_DISTANCE_PX = 5
const TAP_MAX_ELAPSED_MS = 300
/** Painted corner radius of the expanded squircle card (rounded-[38px]). */
const CARD_RADIUS_PX = 38

/**
 * Patch 140 — silhouette test for the expanded card. The rounded/squircle
 * corners are visually transparent but still hit-testable layout, so a press
 * there must count as an outside click, never as a deep-drag start. Returns
 * true only when (x, y) sits outside a w x h rounded rect with radius r; the
 * G2 squircle paints a hair fuller than the circle, so the sub-pixel sliver
 * between the two collapses on click (never the reverse).
 */
function isOutsideCardSilhouette(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): boolean {
  const dx = Math.max(r - x, 0, x - (w - r))
  const dy = Math.max(r - y, 0, y - (h - r))
  if (dx <= 0 || dy <= 0) return false
  return dx * dx + dy * dy > r * r
}

/**
 * MiniIslandCard — floating desktop Dynamic Island (Step 80).
 * Single morphing container springs width/height/border-radius between a
 * 140x36 collapsed pill and a 340x126 expanded card via the baked
 * --island-spring linear() curve (stiffness 500 / damping 40 / mass 1),
 * transform-origin center top, with superellipse-pill/card G2 squircle
 * progressive enhancement. Patch 139 — rigid canvas isolation: the expanded
 * content lives on a fixed 340x126 shrink-0 canvas, flex-centered inside the
 * morphing shell. Because the shell's center is constant while it springs
 * (width interpolates symmetrically around it), the canvas never translates
 * and its children never reflow — the pill merely unmasks the pre-laid-out
 * canvas from the center outward. Staggered choreography: collapsed layer
 * exits scale-90 over 100ms; canvas enters (opacity 220ms ease-out / scale
 * 220ms expo-out, both delayed 100ms) from opacity-0 scale-[0.97], and
 * collapses promptly at 120ms. Fixed slots (art/info/indicator, w-[34px] +
 * w-[38px] timers, w-8/w-10 hitboxes) keep every element coordinate-locked.
 *
 * Patch 140 — three fixes layered on that canvas:
 * 1. Transport row is a strict 3-column grid (grid-cols-3, px-6): prev sits
 *    at the left third, play dead-center, next at the right third. Each cell
 *    is fixed by the grid, so no sibling's width/pulse can displace a side
 *    button — lateral wobble is structurally impossible.
 * 2. Canvas grew 340x114 -> 340x126: px-3.5 keeps the specified 14px side
 *    gutter, py-2.5 (10px) is the only vertical padding that reaches the
 *    required 10-12px clearance — with p-3.5 the 40px art row + 40px transport
 *    row would collapse the row gaps to 1px and the seek bar to within 7px of
 *    the play button. py-2.5 yields 5px row gaps and 11px of clear air.
 * 3. Outside-click collapse: the overlay in MiniIslandApp owns the window
 *    padding, the chevron calls onCollapse() directly, and pointerdown-capture
 *    on this shell treats any press outside the 38px silhouette (the visually
 *    empty squircle corners, which still hit-test as card layout) as an
 *    outside press — before the canvas's deep-drag can swallow it.
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
  onCollapse,
  enterKey = 0
}: MiniIslandCardProps): JSX.Element {
  const isPlaying = useMiniPlayerStore((s) => s.isPlaying)
  const currentTime = useMiniPlayerStore((s) => s.currentTime)
  const duration = useMiniPlayerStore((s) => s.duration)
  const track = useMiniPlayerStore((s) => s.track)

  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const dragStarted = useRef(false)
  const shellRef = useRef<HTMLDivElement>(null)

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

  /** Patch 140 — hard collapse. onCollapse is the MiniIslandApp trigger; the
   *  fallback can only run while expanded, so it collapses either way. */
  const collapseCard = (): void => {
    if (onCollapse) onCollapse()
    else onToggleExpand()
  }

  /**
   * Patch 140 — press anywhere outside the painted 38px silhouette (the
   * visually empty squircle corners) collapses the card. Capture phase runs
   * before the canvas's deep-drag path, and the state flush that follows the
   * discrete pointerdown removes the canvas before mousedown can hand the
   * event to Tauri's native start_dragging (which would eat pointerup and
   * swallow the click entirely). Presses inside the silhouette return early
   * and keep their original behavior (drag / scrub / chevron / transport).
   */
  const handleShellPointerDownCapture = (e: React.PointerEvent): void => {
    if (!isExpanded || e.button !== 0) return
    const shell = shellRef.current
    if (!shell) return
    const rect = shell.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (!isOutsideCardSilhouette(x, y, rect.width, rect.height, CARD_RADIUS_PX)) {
      return
    }
    e.stopPropagation()
    collapseCard()
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
      ref={shellRef}
      data-tauri-drag-region="false"
      onPointerDownCapture={handleShellPointerDownCapture}
      className={cn(
        'relative shrink-0 flex items-center justify-center select-none overflow-hidden bg-[#0D0F15] border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transform-gpu',
        isExpanded
          ? 'superellipse-card w-[340px] h-[126px] rounded-[38px]'
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
            ? 'opacity-0 scale-90 pointer-events-none duration-100 delay-0'
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

      {/* Layer 2: Rigid expanded canvas (Patch 139, grown by Patch 140).
          Fixed 340x126, shrink-0, flex-centered in the morphing shell: the
          shell's center never moves, so the canvas is coordinate-locked from
          frame 0 — the springing pill only unmasks it. Children can never be
          crushed/wrapped by the intermediate widths. Enter: opacity 220ms
          ease-out + transform 220ms expo-out, both delayed 100ms (staggered
          after the collapsed layer's 100ms exit). Exit: prompt 120ms fade.
          px-3.5 py-2.5 (Patch 140): 5px row gaps -> 11px of clearance between
          the seek bar and the play button. rounded-[38px] mirrors the shell's
          silhouette so edge presses that fall inside the painted rounding are
          never swallowed by this deep-drag surface. Deep-drag background;
          interactive controls opt out with data-tauri-drag-region="false". */}
      <div
        data-tauri-drag-region="deep"
        className={cn(
          'w-[340px] h-[126px] shrink-0 px-3.5 py-2.5 rounded-[38px] flex flex-col justify-between select-none relative transform-gpu',
          isExpanded
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-[0.97] pointer-events-none'
        )}
        style={{
          transition: isExpanded
            ? 'opacity 220ms ease-out 100ms, transform 220ms cubic-bezier(0.16, 1, 0.3, 1) 100ms'
            : 'opacity 120ms cubic-bezier(0.4, 0, 0.2, 1), transform 120ms cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        aria-hidden={!isExpanded}
      >
        {/* Row 1 (rigid h-10): art w-10 | info flex-1 min-w-0 px-2.5 | EQ slot w-6 | chevron w-6 */}
        <div data-tauri-drag-region="deep" className="flex h-10 shrink-0 min-w-0 items-center gap-3">
          {cover ? (
            <img
              src={cover}
              alt=""
              draggable={false}
              className="w-10 h-10 shrink-0 rounded-xl border border-white/10 object-cover"
            />
          ) : (
            <span className="grid w-10 h-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-raised">
              <Disc3 size={18} className="text-faint/70" aria-hidden />
            </span>
          )}
          <div className="flex-1 min-w-0 px-2.5 flex flex-col justify-center">
            <p className="truncate whitespace-nowrap text-[13px] font-medium text-ink">
              {track?.title ?? 'Nothing playing'}
            </p>
            <p className="truncate whitespace-nowrap text-[11px] text-muted">
              {track?.artist ?? 'Add a folder in the main window'}
            </p>
          </div>
          {/* Fixed 24px indicator slot — EQ mounts inside it, so a track
              appearing/disappearing can never shift its neighbors. */}
          <div className="w-6 h-6 shrink-0 flex items-center justify-end">
            {hasTrack && <EqBars isPlaying={isPlaying} />}
          </div>
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={collapseCard}
            title="Collapse"
            aria-label="Collapse mini player"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:bg-white/10 hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>

        {/* Row 2 (rigid h-4): timer anchors w-[34px] left / w-[38px] right —
            the flex-1 mx-2 track between them cannot wobble. */}
        <div className="flex h-4 shrink-0 items-center">
          <span className="numeric w-[34px] shrink-0 text-left font-mono tabular-nums text-[11px] text-neutral-400 select-none">
            {formatTime(currentTime)}
          </span>
          <div
            role="presentation"
            data-tauri-drag-region="false"
            onPointerDown={handleScrub}
            className="relative h-1 min-w-0 flex-1 mx-2 cursor-pointer rounded-full bg-white/10"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-ember"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="numeric w-[38px] shrink-0 text-right font-mono tabular-nums text-[11px] text-neutral-400 select-none">
            {remaining !== null ? `-${formatTime(remaining)}` : '--:--'}
          </span>
        </div>

        {/* Row 3 (Patch 140 — rigid 3-column transport grid): the row is split
            into fixed 33% columns, so prev/play/next are anchored to grid
            coordinates instead of being laid out relative to each other. No
            sibling's width, icon swap or pulse can displace a side button —
            lateral wobble during the bloom is mathematically impossible.
            h-10 == the play hitbox, so the button never overhangs into the
            scrubber's clearance. px-6 keeps the transport inset from the card
            edges; cells are justify-start / center / end for symmetry. */}
        <div className="grid grid-cols-3 items-center w-full px-6 shrink-0 h-10 select-none">
          <div className="flex items-center justify-start">
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={() => sendCommand('prev')}
              disabled={!hasTrack}
              title="Previous"
              aria-label="Previous track"
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-white/70 hover:text-white transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              <SkipBack size={18} aria-hidden />
            </button>
          </div>
          <div className="flex items-center justify-center">
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={() => sendCommand('togglePlay')}
              disabled={!hasTrack}
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:scale-105 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 disabled:pointer-events-none"
            >
              {isPlaying ? (
                <Pause fill="currentColor" size={18} aria-hidden />
              ) : (
                <Play className="ml-0.5" fill="currentColor" size={18} aria-hidden />
              )}
            </button>
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={() => sendCommand('next')}
              disabled={!hasTrack}
              title="Next"
              aria-label="Next track"
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-white/70 hover:text-white transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              <SkipForward size={18} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MiniIslandCard
