import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0'

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-ink text-base hover:bg-emberhover',
  outline: 'border border-linestrong bg-raised text-ink hover:bg-line',
  ghost: 'text-muted hover:bg-raised hover:text-ink',
  destructive: 'bg-[#7A2E2E] text-ink hover:bg-[#933434]'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
  icon: 'h-10 w-10'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** Nocturne-styled button (vibefarsi-compatible variant/size API). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', className, type = 'button', ...rest },
  ref
) {
  return <button ref={ref} type={type} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest} />
})
