import React from 'react'
import { cn } from '../lib/utils'

export interface PlayPauseButtonProps {
  isPlaying: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
}

/**
 * PlayPauseButton Component
 * Category 1 Transport Micro-Interaction.
 * Smooth pure SVG dual-path vector morphing between Play triangle and twin Pause bars.
 * Supported by a circular luxury backing with amber glow feedback and zero layout shift.
 */
export function PlayPauseButton({
  isPlaying,
  onClick,
  disabled = false,
  className
}: PlayPauseButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={isPlaying ? 'Pause' : 'Play'}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'group relative flex h-10 w-10 items-center justify-center rounded-full',
        'bg-ink text-[#0A0B0E] shadow-md transition-all duration-200',
        'hover:bg-emberhover hover:scale-105 active:scale-95',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
        'disabled:opacity-40 disabled:pointer-events-none disabled:hover:scale-100',
        isPlaying
          ? 'bg-ember shadow-[0_0_18px_rgba(234,179,8,0.45)]'
          : 'hover:shadow-[0_0_14px_rgba(234,179,8,0.3)]',
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px] fill-current pointer-events-none select-none overflow-visible"
        aria-hidden="true"
      >
        {/* Left half morphs from left triangle trapezoid to left pause bar */}
        <path
          className="play-pause-path"
          d={
            isPlaying
              ? 'M 6 4 L 10 4 L 10 20 L 6 20 Z'
              : 'M 7 4 L 13 7.5 L 13 16.5 L 7 20 Z'
          }
        />
        {/* Right half morphs from right triangle tip to right pause bar */}
        <path
          className="play-pause-path"
          d={
            isPlaying
              ? 'M 14 4 L 18 4 L 18 20 L 14 20 Z'
              : 'M 13 7.5 L 19 12 L 19 12 L 13 16.5 Z'
          }
        />
      </svg>
    </button>
  )
}

export default PlayPauseButton

