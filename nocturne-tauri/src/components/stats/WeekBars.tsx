import React from 'react'

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const W = 600
const H = 200
const LEFT_PAD = 40
const RIGHT_PAD = 16
const TOP = 28
const BOTTOM = 32

export interface WeekBarsProps {
  data: number[]
  todayIndex: number
}

export function WeekBars({ data, todayIndex }: WeekBarsProps): JSX.Element {
  const safeData = data.length === 7 ? data : [0, 0, 0, 0, 0, 0, 0]
  const rawMax = Math.max(...safeData, 0)
  // Adaptive ceiling to prevent empty void at low playback hours
  const ceiling =
    rawMax === 0
      ? 1.0
      : rawMax <= 0.2
        ? 0.2
        : rawMax <= 0.5
          ? 0.5
          : rawMax <= 1.0
            ? 1.0
            : Math.ceil(rawMax * 1.2 * 10) / 10

  const plotW = W - LEFT_PAD - RIGHT_PAD
  const plotH = H - TOP - BOTTOM
  const slot = plotW / 7
  const barW = slot * 0.52

  const midVal = ceiling / 2

  return (
    <svg
      className="ns-bars"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Weekly Listening Hours"
    >
      {/* 100% Guideline */}
      <line
        x1={LEFT_PAD}
        y1={TOP}
        x2={W - RIGHT_PAD}
        y2={TOP}
        stroke="rgba(255,255,255,0.14)"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <text
        x={LEFT_PAD - 8}
        y={TOP + 3.5}
        textAnchor="end"
        className="bar-grid-label font-mono text-[10px]"
        fill="rgba(255,255,255,0.45)"
      >
        {ceiling.toFixed(1)}h
      </text>

      {/* 50% Guideline */}
      <line
        x1={LEFT_PAD}
        y1={TOP + plotH / 2}
        x2={W - RIGHT_PAD}
        y2={TOP + plotH / 2}
        stroke="rgba(255,255,255,0.14)"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <text
        x={LEFT_PAD - 8}
        y={TOP + plotH / 2 + 3.5}
        textAnchor="end"
        className="bar-grid-label font-mono text-[10px]"
        fill="rgba(255,255,255,0.45)"
      >
        {midVal.toFixed(1)}h
      </text>

      {/* 0% Baseline */}
      <line
        x1={LEFT_PAD}
        y1={TOP + plotH}
        x2={W - RIGHT_PAD}
        y2={TOP + plotH}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
      <text
        x={LEFT_PAD - 8}
        y={TOP + plotH + 3.5}
        textAnchor="end"
        className="bar-grid-label font-mono text-[10px]"
        fill="rgba(255,255,255,0.45)"
      >
        0h
      </text>

      {/* Bars and labels */}
      {safeData.map((v, i) => {
        const h = Math.max(4, (v / ceiling) * plotH) // scaled dynamically against adaptive ceiling
        const x = LEFT_PAD + i * slot + (slot - barW) / 2 // Left to Right: Sat(0) -> Fri(6)
        const y = TOP + plotH - h
        const isToday = i === todayIndex
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={4}
              style={{ ['--i' as string]: i }}
              fill={isToday ? '#f59e0b' : '#ffffff'}
              opacity={isToday ? 1 : 0.16}
            >
              <title>{`${DAYS[i]}: ${v.toFixed(1)} hours`}</title>
            </rect>
            {v > 0 && (
              <text x={x + barW / 2} y={y - 7} textAnchor="middle" className="bar-label">
                {v.toFixed(1)}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={H - 12}
              textAnchor="middle"
              className={isToday ? 'day-label today' : 'day-label'}
            >
              {DAYS[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default WeekBars
