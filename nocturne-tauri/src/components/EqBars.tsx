import React from 'react'
import { cn } from '../lib/utils'

export interface EqBarsProps {
  className?: string
  isPlaying?: boolean
}

/**
 * 3-bar mini equalizer for the now-playing row. Pure CSS, GPU-only.
 * Pauses animation cleanly on pause via animationPlayState.
 */
export function EqBars({ className, isPlaying = true }: EqBarsProps): JSX.Element {
  return (
    <span aria-hidden className={cn('flex h-3.5 items-end gap-[2px] shrink-0', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="waveform-idle-bar w-[3px] rounded-full bg-[#EAB308]"
          style={{
            height: '100%',
            animationDelay: `${i * 0.18}s`,
            animationDuration: '0.9s',
            animationPlayState: isPlaying ? 'running' : 'paused'
          }}
        />
      ))}
    </span>
  )
}

export default EqBars
