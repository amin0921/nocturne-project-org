import React from 'react'
import { LayoutDashboard, Table2 } from 'lucide-react'
import { useUIStore, type ViewMode } from '../stores/useUIStore'
import { cn } from '../lib/utils'

const OPTIONS: { id: ViewMode; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: 'stage', label: 'Stage', icon: LayoutDashboard, hint: 'Cinematic stage view (Ctrl+1)' },
  { id: 'library', label: 'Library', icon: Table2, hint: 'Full library table (Ctrl+2)' }
]

export function ViewToggle({ className }: { className?: string }): JSX.Element {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)

  return (
    <div
      role="group"
      aria-label="Switch main view"
      className={cn('flex rounded-full border border-white/10 bg-black/40 p-1', className)}
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon
        const active = view === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setView(o.id)}
            aria-pressed={active}
            title={o.hint}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold outline-none transition-all duration-150',
              'focus-visible:ring-2 focus-visible:ring-[#EAB308]',
              active
                ? 'bg-[#EAB308] text-black shadow-[0_0_16px_rgba(234,179,8,0.4)]'
                : 'text-[#94A3B8] hover:text-[#F2F3F5] hover:bg-white/5'
            )}
          >
            <Icon size={14} aria-hidden />
            <span>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ViewToggle
