import React from 'react'
import { cn } from '../../lib/utils'

export interface PlayPauseButtonProps {
  isPlaying: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
}

const LEFT_PAUSED = 'M 6,4 L 14.5,9.5 L 14.5,14.5 L 6,20 Z'
const LEFT_PLAYING = 'M 6,4 L 10,4 L 10,20 L 6,20 Z'

const RIGHT_PAUSED = 'M 13.5,8.8 L 20,12 L 13.5,15.2 Z'
const RIGHT_PLAYING = 'M 14,4 L 18,4 L 18,20 L 14,20 Z'

/**
 * PlayPauseButton Component
 * Category 1 Transport Micro-Interaction.
 * Zero-Seam Dual-Path SVG Morphing:
 * - Paused State: Two coordinated vector paths fuse with mathematical overlap (x=13.5 to 14.5)
 *   and shape-rendering="geometricPrecision", eliminating any hairline antialiasing seams.
 * - Playing State: The two paths morph over 260ms into crisp parallel vertical pill bars.
 * - Amber Aura Pulse: The outer gold circular button emits a hardware-accelerated breathing pulse
 *   when playing, settling into a steady resting glow when paused.
 */
export function PlayPauseButton({
  isPlaying,
  onClick,
  disabled = false,
  className
}: PlayPauseButtonProps): JSX.Element {
  const leftD = isPlaying ? LEFT_PLAYING : LEFT_PAUSED
  const rightD = isPlaying ? RIGHT_PLAYING : RIGHT_PAUSED

  // Allow custom size overrides (e.g. MiniIslandCard h-8 w-8) while defaulting to size-12
  const hasCustomSize = className && /\b(h-|w-|size-)\d+/.test(className)

  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      onClick={onClick}
      disabled={disabled}
      title={isPlaying ? 'Pause' : 'Play'}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'play-pause-btn grid place-items-center rounded-full bg-[#f59e0b] text-black',
        !hasCustomSize && 'size-12',
        'shadow-[0_0_24px_rgba(245,158,11,0.45)] transition-transform hover:scale-105 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
        'disabled:opacity-40 disabled:pointer-events-none disabled:hover:scale-100',
        'motion-reduce:transition-none',
        isPlaying && 'animate-play-pulse',
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        shapeRendering="geometricPrecision"
        className={cn(
          'play-pause-icon size-5 fill-current pointer-events-none select-none overflow-visible',
          isPlaying ? 'translate-x-0' : 'translate-x-[1px]'
        )}
        style={{
          transition: 'transform 260ms ease, opacity 200ms ease'
        }}
        aria-hidden="true"
      >
        <path
          d={leftD}
          fill="currentColor"
          stroke="none"
          shapeRendering="geometricPrecision"
          className="play-pause-path"
          style={{
            d: `path("${leftD}")`,
            transition: 'd 260ms cubic-bezier(0.22, 1, 0.36, 1)'
          } as React.CSSProperties}
        />
        <path
          d={rightD}
          fill="currentColor"
          stroke="none"
          shapeRendering="geometricPrecision"
          className="play-pause-path"
          style={{
            d: `path("${rightD}")`,
            transition: 'd 260ms cubic-bezier(0.22, 1, 0.36, 1)'
          } as React.CSSProperties}
        />
      </svg>
    </button>
  )
}

export default PlayPauseButton
