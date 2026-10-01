import React from 'react'
import { cn } from '../../lib/utils'
import './empty-state.css'

export interface EmptyStateAction {
  label: string
  onClick: () => void
}

export interface EmptyStateProps {
  /** Lucide icon rendered inside the subtle rounded badge slot. */
  icon: React.ReactNode
  /** Crisp bone headline; `dir="auto"` follows the content's text direction. */
  title: string
  /** Optional muted supporting copy; `dir="auto"`. */
  description?: string
  /** Optional single primary action rendered under the copy. */
  action?: EmptyStateAction
  className?: string
}

/**
 * EmptyState — shared obsidian empty-state card (PATCH 04 Phase 01).
 *
 * One design language for every "nothing here yet" surface: badge icon slot,
 * title, optional description, optional primary action. The root stretches to
 * the host pane (`min-h-full`) so the card centers vertically inside scrollable
 * and flex panes alike. Entrance is the PATCH 05 §2/§3 recipe: opacity +
 * translateY over 200ms cubic-bezier(0.16, 1, 0.3, 1) — composite-only CSS,
 * zero Framer Motion (see empty-state.css).
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'nq-empty-state flex min-h-full w-full flex-col items-center justify-center p-6 text-center select-none',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="mb-3 inline-flex items-center justify-center rounded-xl border border-[#232936] bg-[#1A1E27] p-3.5 text-[#EAB308]"
      >
        {icon}
      </span>
      <p dir="auto" className="text-sm font-medium text-[#F2F3F5]">
        {title}
      </p>
      {description && (
        <p dir="auto" className="mt-1 max-w-[260px] text-center text-xs leading-relaxed text-[#A8B0BE]">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-lg border border-[#2E3648] bg-[#1A1E27] px-3.5 py-1.5 text-xs font-medium text-[#F2F3F5] outline-none transition-all select-none hover:border-[#EAB308]/40 hover:bg-[#232936] active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
