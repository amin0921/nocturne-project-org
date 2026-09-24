import React from 'react'

export interface RankedItem {
  id: string
  title: string
  sub: string
  metric: string
  value: number
}

export interface TopListProps {
  title: string
  items: RankedItem[]
  onSelect?: (id: string) => void
}

export function TopList({ title, items, onSelect }: TopListProps): JSX.Element {
  const max = items.length > 0 && items[0].value > 0 ? items[0].value : 1

  return (
    <div className="ns-card">
      <div className="label text-[13px] font-semibold text-[#e8eaf0] mb-3" dir="auto">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/30 font-mono">
            No activity recorded
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              role="button"
              tabIndex={0}
              className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer select-none"
              onClick={() => onSelect?.(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelect?.(item.id)
                }
              }}
            >
              {/* 1. Rank */}
              <span
                className={`font-mono text-xs w-5 text-center shrink-0 transition-colors ${
                  i < 3 ? 'text-[#f59e0b] font-bold' : 'text-white/40 group-hover:text-white/70'
                }`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* 2. Badge */}
              <div className="size-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[#f59e0b] font-semibold text-xs flex items-center justify-center shrink-0">
                {item.title ? item.title.trim().charAt(0).toUpperCase() : '•'}
              </div>

              {/* 3. Main Column (Title, Subtitle, Progress Bar) */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-baseline justify-between gap-2">
                  <span dir="auto" className="text-xs font-medium text-white/90 truncate">
                    {item.title}
                  </span>
                  <span className="font-mono text-[11px] text-white/40 shrink-0 tabular-nums">
                    {item.metric}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/40 mt-0.5">
                  <span dir="auto" className="truncate">
                    {item.sub}
                  </span>
                </div>
                {/* Relative Progress Bar - always fits the full width of the main text column */}
                <div className="w-full h-1 rounded-full bg-white/5 mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500/40 to-[#f59e0b] rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(6, Math.min(100, (item.value / max) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default TopList
