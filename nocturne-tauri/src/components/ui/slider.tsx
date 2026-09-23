import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> {
  value: number
  min?: number
  max?: number
  step?: number
  /** Fires continuously while dragging / arrowing. */
  onValueChange?: (value: number) => void
  /** Fires on release (pointer/keys/blur) — commit point for seeks. */
  onCommit?: (value: number) => void
}

/**
 * Nocturne-styled range slider (vibefarsi-compatible API).
 * Native input = free keyboard support + correct RTL mirroring;
 * fill comes from `--vf-p` consumed by `.vf-slider` CSS (RTL-aware).
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    min = 0,
    max = 100,
    step = 1,
    onValueChange,
    onCommit,
    className,
    disabled,
    'aria-label': ariaLabel,
    ...rest
  },
  ref
) {
  const safe = Number.isFinite(value) ? value : min
  const pct = max > min ? Math.min(100, Math.max(0, ((safe - min) / (max - min)) * 100)) : 0
  return (
    <input
      ref={ref}
      type="range"
      className={cn('vf-slider', className)}
      style={{ '--vf-p': `${pct}%` } as React.CSSProperties}
      min={min}
      max={max}
      step={step}
      value={safe}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-valuetext={ariaLabel ? `${ariaLabel}: ${Math.round(safe)}` : undefined}
      onChange={(e) => onValueChange?.(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onBlur={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      {...rest}
    />
  )
})
