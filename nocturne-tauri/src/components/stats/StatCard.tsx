import React from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useCountUp, formatCount } from './useCountUp'

export interface StatCardProps {
  label: string
  value: number
  unit: string
  delta?: number
  trend?: number[]
  index?: number
  decimals?: number
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  trend,
  index = 0,
  decimals = 0
}: StatCardProps): JSX.Element {
  const { ref, value: v } = useCountUp(value)

  // Guarantee exactly 8 normalized micro-trend values
  const safeTrend = React.useMemo(() => {
    if (!trend || trend.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0]
    if (trend.length === 8) return trend
    if (trend.length < 8) {
      return [...Array(8 - trend.length).fill(0), ...trend]
    }
    return trend.slice(-8)
  }, [trend])

  const max = Math.max(...safeTrend, 1)

  return (
    <div className="ns-card" style={{ ['--ns-delay' as string]: `${index * 80}ms` }}>
      <div className="label" dir="auto">
        {label}
      </div>
      <div className="value-row">
        <span className="value" ref={ref}>
          {/* Reserved width phantom */}
          <span aria-hidden="true" style={{ visibility: 'hidden', position: 'absolute' }}>
            {formatCount(value, decimals)}
          </span>
          {formatCount(v, decimals)}
        </span>
        <span className="unit" dir="auto">
          {unit}
        </span>
        {delta !== undefined && (
          <span className="ns-delta" data-neg={delta < 0} dir="ltr">
            {delta < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
            {Math.abs(Math.round(delta))}%
          </span>
        )}
      </div>
      <div className="ns-trend" dir="ltr" aria-hidden="true">
        {safeTrend.map((t, i) => {
          const isLast = i === safeTrend.length - 1
          const heightPct = Math.max(12, Math.round((t / max) * 100))
          return (
            <i
              key={i}
              className={isLast ? 'active-amber' : undefined}
              style={{
                height: `${heightPct}%`,
                ['--i' as string]: i
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export default StatCard
