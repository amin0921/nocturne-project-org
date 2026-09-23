import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

/**
 * Nocturne card (vibefarsi spec: 1px border token, card background,
 * radius from --radius, no heavy shadow). LTR, Latin digits.
 */
export function Card({ className, ...rest }: CardProps): JSX.Element {
  return <div className={cn('rounded-xl border border-line bg-surface', className)} {...rest} />
}

export function CardContent({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('p-4', className)} {...rest} />
}
