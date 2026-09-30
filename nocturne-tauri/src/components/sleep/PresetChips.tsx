import React from 'react'
import {
  startSleepEndOfQueue,
  startSleepEndOfTrack,
  startSleepTimed,
  useSleepTimer
} from '../../stores/useSleepTimer'
import { cn } from '../../lib/utils'

const MINUTE_PRESETS = [15, 30, 45] as const

const CHIP_BASE = [
  'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors duration-150',
  'border-line bg-raised text-muted hover:border-[#EAB308]/40 hover:text-ink',
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40'
] as const

const CHIP_ACTIVE = 'border-[#EAB308]/60 bg-[#EAB308]/10 text-ember hover:text-ember' as const

export interface PresetChipsProps {
  onPicked?: () => void
}

/**
 * PresetChips — 15m / 30m / 45m grid plus full-width End of Track / End of
 * Queue rows. The active preset (for the current run) is highlighted in ember.
 */
export function PresetChips({ onPicked }: PresetChipsProps): JSX.Element {
  const mode = useSleepTimer((s) => s.mode)
  const minutes = useSleepTimer((s) => s.minutes)

  const pick = (start: () => void) => (): void => {
    start()
    onPicked?.()
  }

  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Sleep timer presets">
      {MINUTE_PRESETS.map((m) => {
        const isActive = mode === 'timed' && minutes === m
        return (
          <button
            key={m}
            type="button"
            onClick={pick(() => startSleepTimed(m))}
            aria-pressed={isActive}
            className={cn(CHIP_BASE, isActive && CHIP_ACTIVE)}
          >
            {m}m
          </button>
        )
      })}

      <button
        type="button"
        onClick={pick(startSleepEndOfTrack)}
        aria-pressed={mode === 'end-of-track'}
        className={cn('col-span-3 text-left', CHIP_BASE, mode === 'end-of-track' && CHIP_ACTIVE)}
      >
        End of Track
      </button>

      <button
        type="button"
        onClick={pick(startSleepEndOfQueue)}
        aria-pressed={mode === 'end-of-queue'}
        className={cn('col-span-3 text-left', CHIP_BASE, mode === 'end-of-queue' && CHIP_ACTIVE)}
      >
        End of Queue
      </button>
    </div>
  )
}

export default PresetChips
