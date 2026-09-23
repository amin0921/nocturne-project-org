import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: ReactNode
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
}

const MENU_WIDTH = 224

/**
 * Cursor-anchored dark menu. Closes on outside pointer-down, Esc, resize, or scroll.
 * No portal library — fixed positioning from the app root is sufficient.
 */
export function ContextMenu({ x, y, items, onClose, ariaLabel = 'Context menu' }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - items.length * 36 - 16))

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-50 rounded-lg border border-line bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect()
            onClose()
          }}
          className={cn(
            'flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px]',
            item.destructive ? 'text-[#FF6369] hover:bg-line' : 'text-ink hover:bg-line',
            'disabled:opacity-40'
          )}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
