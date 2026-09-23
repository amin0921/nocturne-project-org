import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

const SPINNER_SIZES: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]'
}

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize
  label?: string
}

/**
 * Accessible circular spinner (vibefarsi spec: role="status", border-current,
 * border-e-transparent, animate-spin, sizes xs/sm/md/lg, sr-only fallback).
 */
export function Spinner({
  size = 'md',
  label = 'Loading…',
  className,
  ...props
}: SpinnerProps): JSX.Element {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center justify-center text-muted', className)}
      {...props}
    >
      <span
        className={cn(
          'rounded-full border-current border-e-transparent animate-spin motion-reduce:animate-none',
          SPINNER_SIZES[size]
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  spinnerSize?: SpinnerSize
  label?: string
}

/**
 * Semi-transparent loading overlay with centered spinner.
 * Inherits parent element's border radius.
 */
export function LoadingOverlay({
  spinnerSize = 'md',
  label,
  className,
  ...props
}: LoadingOverlayProps): JSX.Element {
  return (
    <div
      role="status"
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-base/60 backdrop-blur-[1px]',
        className
      )}
      {...props}
    >
      <Spinner size={spinnerSize} label={label} />
    </div>
  )
}
