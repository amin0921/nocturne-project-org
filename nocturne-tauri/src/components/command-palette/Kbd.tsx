import React from 'react'
import { cn } from '../../lib/utils'

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  size?: 'sm' | 'md'
  active?: boolean
  pressed?: boolean
}

/**
 * Clean studio keycap component (single border + subtle bottom lip,
 * no multi-shadow stacks — those render badly in WebView2).
 */
export const Kbd: React.FC<KbdProps> = ({
  children,
  size = 'sm',
  active = false,
  pressed = false,
  className,
  ...props
}) => {
  return (
    <kbd
      className={cn(
        'nc-kbd',
        size === 'sm' ? 'nc-kbd-sm' : 'nc-kbd-md',
        active && 'nc-kbd-active',
        pressed && 'nc-kbd-pressed',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}

export interface KbdSequenceProps {
  keys: string[]
  size?: 'sm' | 'md'
  active?: boolean
  className?: string
}

/**
 * Renders a chord / sequence of studio keycaps separated by subtle '+' glyphs.
 */
export const KbdSequence: React.FC<KbdSequenceProps> = ({
  keys,
  size = 'sm',
  active = false,
  className
}) => {
  if (!keys || keys.length === 0) return null

  return (
    <div className={cn('inline-flex items-center gap-1 select-none', className)}>
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          {index > 0 && (
            <span className={cn('text-[10px] font-medium leading-none px-0.5', active ? 'text-amber-500/70' : 'text-faint/60')}>
              +
            </span>
          )}
          <Kbd size={size} active={active}>
            {key}
          </Kbd>
        </React.Fragment>
      ))}
    </div>
  )
}
