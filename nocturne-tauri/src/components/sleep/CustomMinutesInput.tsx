import React, { useState } from 'react'
import {
  SLEEP_MAX_MINUTES,
  SLEEP_MIN_MINUTES,
  startSleepTimed
} from '../../stores/useSleepTimer'
import { cn } from '../../lib/utils'

export interface CustomMinutesInputProps {
  onPicked?: () => void
}

/**
 * CustomMinutesInput — JetBrains Mono numeric entry, Latin digits only,
 * bounded 1-180 minutes. Enter or the Start chip commits.
 */
export function CustomMinutesInput({ onPicked }: CustomMinutesInputProps): JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const submit = (): void => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < SLEEP_MIN_MINUTES || n > SLEEP_MAX_MINUTES) {
      setError(true)
      return
    }
    startSleepTimed(n)
    setValue('')
    setError(false)
    onPicked?.()
  }

  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <label
        htmlFor="sleep-custom-minutes"
        className="text-[11px] font-medium uppercase tracking-wider text-faint"
      >
        Custom (minutes)
      </label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          id="sleep-custom-minutes"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          placeholder={`1–${SLEEP_MAX_MINUTES}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))
            setError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          aria-invalid={error}
          className={cn(
            'numeric w-full min-w-0 rounded-md border bg-base px-2 py-1.5',
            'font-mono text-xs text-ink placeholder:font-sans placeholder:text-faint',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
            error ? 'border-ember/70' : 'border-line focus:border-[#EAB308]/50'
          )}
        />
        <button
          type="button"
          onClick={submit}
          className={cn(
            'shrink-0 rounded-md bg-[#EAB308]/15 px-2.5 py-1.5 text-xs font-semibold text-ember',
            'transition-colors duration-150 hover:bg-[#EAB308]/25',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/50'
          )}
        >
          Start
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[10px] text-ember" role="alert">
          Enter {SLEEP_MIN_MINUTES}–{SLEEP_MAX_MINUTES} minutes
        </p>
      )}
    </div>
  )
}

export default CustomMinutesInput
