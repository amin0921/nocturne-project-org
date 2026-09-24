import React from 'react'

export type RangeId = 'week' | 'month' | 'year'

export const RANGES: { id: RangeId; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' }
]

export interface RangeSwitcherProps {
  active: RangeId
  onChange: (r: RangeId) => void
}

export function RangeSwitcher({ active, onChange }: RangeSwitcherProps): JSX.Element {
  const activeIndex = Math.max(0, RANGES.findIndex((r) => r.id === active))

  return (
    <div
      className="relative inline-flex p-1 rounded-xl bg-white/[0.04] border border-white/10 select-none"
      role="tablist"
      aria-label="Time Range"
    >
      {/* Fixed 80px pill sliding purely via GPU transform */}
      <span
        className="absolute top-1 bottom-1 left-1 w-20 rounded-lg bg-white/[0.08] border border-white/15 pointer-events-none"
        aria-hidden="true"
        style={{
          transform: `translateX(${activeIndex * 80}px)`,
          transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
        }}
      />
      {RANGES.map((r) => {
        const isCurrent = r.id === active
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={() => onChange(r.id)}
            className={`w-20 h-8 flex items-center justify-center text-xs font-medium transition-colors select-none relative z-10 ${
              isCurrent ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

export default RangeSwitcher
