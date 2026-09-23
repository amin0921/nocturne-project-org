import React from 'react'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { DockItem } from '../config/dock'
import { cn } from '../lib/utils'

export interface MicroDockProps {
  items: DockItem[]
  activeId: string
  onSelect: (item: DockItem) => void
  expanded: boolean
  onToggleExpand: () => void
  className?: string
}

/**
 * MicroDock Component
 * Floating left icon-only dock pill.
 * Expands smoothly to reveal labels, pure-CSS tooltips, amber glow active indicator.
 */
export function MicroDock({
  items = [],
  activeId,
  onSelect,
  expanded,
  onToggleExpand,
  className
}: MicroDockProps): JSX.Element {
  const safeItems = Array.isArray(items) ? items : []

  return (
    <nav
      aria-label="Primary"
      role="toolbar"
      aria-orientation="vertical"
      className={cn(
        'flex flex-col items-center gap-1.5 border border-white/10 bg-[#121419]/90 py-3 shadow-2xl backdrop-blur-xl select-none overflow-hidden',
        'transition-[width,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        expanded ? 'w-44 rounded-3xl px-2' : 'w-14 rounded-full px-0',
        className
      )}
    >
      {safeItems.map((item) => {
        if (!item) return null
        const Icon = item.icon
        const active = item.id === activeId || item.action === activeId
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelect(item)
            }}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            title={!expanded ? item.label : undefined}
            className={cn(
              'group relative flex h-10 items-center rounded-full outline-none transition-[color,background-color,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden',
              'focus-visible:ring-2 focus-visible:ring-[#EAB308]',
              expanded ? 'w-full pl-4 pr-3 gap-3' : 'w-10 justify-center gap-0',
              active ? 'text-[#EAB308]' : 'text-[#94A3B8] hover:bg-white/10 hover:text-[#F2F3F5]'
            )}
          >
            {/* glowing active indicator pill bar */}
            {active && (
              <span
                aria-hidden
                className="absolute left-1 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-[#EAB308] shadow-[0_0_8px_rgba(234,179,8,0.7)] pointer-events-none"
              />
            )}

            {Icon && <Icon size={18} className="shrink-0" strokeWidth={active ? 2.4 : 2} />}

            <span
              dir="auto"
              className={cn(
                'truncate whitespace-nowrap text-[13px] font-medium',
                expanded
                  ? 'opacity-100 max-w-[120px] transition-all duration-200 delay-100 ease-out'
                  : 'opacity-0 max-w-0 pointer-events-none transition-all duration-150 ease-in'
              )}
            >
              {item.label}
            </span>

            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="numeric absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-[#EAB308] text-[9px] font-bold text-black">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        )
      })}

      {/* expand / collapse */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleExpand()
        }}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        className="mt-1 grid size-10 place-items-center rounded-full text-[#94A3B8] outline-none transition-colors hover:bg-white/10 hover:text-[#F2F3F5] focus-visible:ring-2 focus-visible:ring-[#EAB308]"
      >
        {expanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
      </button>
    </nav>
  )
}

export default MicroDock
