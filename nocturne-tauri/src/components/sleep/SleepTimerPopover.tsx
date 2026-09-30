import React from 'react'
import { MoonStar } from 'lucide-react'
import {
  cancelSleepTimer,
  useSleepTimer
} from '../../stores/useSleepTimer'
import { cn } from '../../lib/utils'
import { PresetChips } from './PresetChips'
import { CustomMinutesInput } from './CustomMinutesInput'

export interface SleepTimerPopoverProps {
  open: boolean
  onClose: () => void
}

/**
 * SleepTimerPopover — anchor-anchored sheet above the moon toggle.
 * Mount animation is origin-aware (bottom-right) scale 0.96 -> 1 + opacity,
 * 180ms cubic-bezier(0.16, 1, 0.3, 1) — pure composite properties only.
 */
export function SleepTimerPopover({ open, onClose }: SleepTimerPopoverProps): JSX.Element | null {
  const mode = useSleepTimer((s) => s.mode)
  const active = mode !== 'inactive'

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Sleep timer"
      className={cn(
        'sleep-popover absolute bottom-[calc(100%+10px)] right-0 z-50 w-64 rounded-xl',
        'border border-line bg-surface/95 p-3 shadow-island backdrop-blur-md'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
          Sleep timer
        </span>
        {active && (
          <button
            type="button"
            onClick={() => {
              cancelSleepTimer()
              onClose()
            }}
            className={cn(
              'rounded-md border border-[#EAB308]/40 px-2 py-1 text-[11px] font-medium text-ember',
              'transition-colors duration-150 hover:bg-[#EAB308]/10',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/50'
            )}
          >
            Cancel timer
          </button>
        )}
      </div>

      <PresetChips onPicked={onClose} />
      <CustomMinutesInput onPicked={onClose} />
    </div>
  )
}

export default SleepTimerPopover
