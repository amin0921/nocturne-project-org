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
 * Play state: single continuous solid polygon (stroke="none") — no split
 * paths, so no antialiasing seam can form down the triangle's middle.
 * Pause state: two distinct vertical bars. Circular luxury backing with
 * amber glow feedback and zero layout shift.
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
      {isPlaying ? (
        <svg
          viewBox="0 0 24 24"
          stroke="none"
          className="h-[18px] w-[18px] fill-current pointer-events-none select-none overflow-visible"
          aria-hidden="true"
        >
          {/* Pause: two distinct vertical bars */}
          <path d="M 6 4 L 10 4 L 10 20 L 6 20 Z" />
          <path d="M 14 4 L 18 4 L 18 20 L 14 20 Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          stroke="none"
          className="h-[18px] w-[18px] fill-current text-black translate-x-0.5 pointer-events-none select-none overflow-visible"
          aria-hidden="true"
        >
          {/* Play: one solid continuous triangle — zero internal seams */}
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      )}
    </button>
  )
}

export default PlayPauseButton

