import React, { useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { GripHorizontal } from 'lucide-react'
import { cn } from '../lib/utils'

export interface WindowGripPillProps {
  label?: string
  showLabel?: boolean
  className?: string
}

/**
 * WindowGripPill Component
 * Dedicated visual micro dark-glass drag handle for frameless window movement.
 * Attaches native programmatic dragging strictly to pointer down.
 * Single-purpose: exclusively moves the window without any double-click maximize side effects.
 */
export function WindowGripPill({
  label = 'Nocturne',
  showLabel = true,
  className
}: WindowGripPillProps): JSX.Element {
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      // Primary left click only
      e.preventDefault()
      try {
        void getCurrentWindow().startDragging()
      } catch (err) {
        console.debug('[WindowGripPill] startDragging error:', err)
      }
    }
  }, [])

  return (
    <div
      data-tauri-drag-region
      onPointerDown={handlePointerDown}
      title="Drag to move window"
      className={cn(
        'group flex items-center gap-1.5 px-3 py-1 rounded-full',
        'border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20',
        'text-faint hover:text-muted shadow-sm backdrop-blur-md',
        'select-none cursor-grab active:cursor-grabbing transition-all duration-150',
        'pointer-events-auto touch-none',
        className
      )}
    >
      <GripHorizontal
        size={13}
        className="pointer-events-none select-none text-faint group-hover:text-ember transition-colors"
        aria-hidden
      />
      {showLabel && (
        <span className="pointer-events-none select-none text-[10px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      )}
    </div>
  )
}

export default WindowGripPill
