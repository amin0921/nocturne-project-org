import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode
} from 'react'
import { cn } from '../../lib/utils'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  content: ReactNode
  children: ReactElement
  side?: TooltipSide
  className?: string
  id?: string
  disabled?: boolean
}

const SIDE_CLASSES: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2'
}

/**
 * Nocturne tooltip (vibefarsi spec: pure CSS hover/focus-within, no JS runtime,
 * role="tooltip" wired with aria-describedby, Nocturne dark styling).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  id,
  disabled = false
}: TooltipProps): JSX.Element {
  const generatedId = useId()
  const tooltipId = id ?? `tooltip-${generatedId}`

  if (!content || disabled) {
    return children
  }

  const child = isValidElement<{ 'aria-describedby'?: string }>(children)
    ? cloneElement(children, {
        'aria-describedby': children.props['aria-describedby']
          ? `${children.props['aria-describedby']} ${tooltipId}`
          : tooltipId
      })
    : children

  return (
    <div className="group/tooltip relative inline-flex items-center">
      {child}
      <div
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-line bg-raised px-2.5 py-1 text-xs font-medium text-ink shadow-lg',
          'opacity-0 transition-opacity duration-150 group-hover/tooltip:opacity-100 group-has-[:focus-visible]/tooltip:opacity-100',
          'motion-reduce:transition-none',
          SIDE_CLASSES[side],
          className
        )}
      >
        {content}
      </div>
    </div>
  )
}
