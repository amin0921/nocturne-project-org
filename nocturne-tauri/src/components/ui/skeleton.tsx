import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export type SkeletonVariant = 'pulse' | 'shimmer'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant
}

/**
 * Nocturne skeleton placeholder (vibefarsi spec: pulse and shimmer modes, aria-hidden).
 * Automatically respects prefers-reduced-motion.
 */
export function Skeleton({
  variant = 'shimmer',
  className,
  ...props
}: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded',
        variant === 'pulse' && 'animate-pulse bg-raised motion-reduce:animate-none',
        variant === 'shimmer' && 'vf-skeleton-shimmer',
        className
      )}
      {...props}
    />
  )
}
