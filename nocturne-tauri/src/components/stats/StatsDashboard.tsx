import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { StatCard } from './StatCard'
import { WeekBars } from './WeekBars'
import { TopList, type RankedItem } from './TopList'
import { RangeSwitcher, type RangeId } from './RangeSwitcher'
import './stats-styles.css'

export interface StatsData {
  hours: number
  hoursDelta: number
  hoursTrend: number[]
  plays: number
  playsDelta: number
  playsTrend: number[]
  artists: number
  artistsDelta: number
  activeDays: number
  weekBars: number[] // 7 values, Saturday to Friday
  todayIndex: number
  topArtists: RankedItem[]
  topTracks: RankedItem[]
}

export function StatsDashboard(): JSX.Element {
  const [range, setRange] = useState<RangeId>('week')
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    invoke<StatsData>('get_listening_stats', { range })
      .then((res) => {
        if (active) {
          setData(res)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('[StatsDashboard] Error fetching stats:', err)
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [range])

  const isEmpty = !loading && data && data.plays === 0

  return (
    <div
      className="flex h-full w-full flex-col gap-6 overflow-y-auto px-6 pt-5 pb-32 select-none nocturne-scroll scroll-smooth"
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Header with Title and Range Switcher */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#e8eaf0] m-0">
            Listening Stats
          </h2>
          <p className="text-xs text-slate-400/80 mt-1 m-0 font-sans">
            100% private and offline listening insights
          </p>
        </div>
        <RangeSwitcher active={range} onChange={setRange} />
      </div>

      {data && (
        <>
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <StatCard
              index={0}
              label="Hours Listened"
              value={data.hours}
              unit="hours"
              delta={data.hoursDelta}
              trend={data.hoursTrend}
              decimals={data.hours < 100 ? 1 : 0}
            />
            <StatCard
              index={1}
              label="Tracks Played"
              value={data.plays}
              unit="plays"
              delta={data.playsDelta}
              trend={data.playsTrend}
            />
            <StatCard
              index={2}
              label="Unique Artists"
              value={data.artists}
              unit="artists"
              delta={data.artistsDelta}
            />
            <StatCard
              index={3}
              label="Active Days"
              value={data.activeDays}
              unit="days"
            />
          </div>

          {/* Unified Empty State when zero plays exist */}
          {isEmpty ? (
            <div className="ns-card flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className="text-sm font-medium text-white/80 m-0">
                No listening activity recorded in this period yet.
              </p>
              <p className="text-xs text-white/40 mt-1.5 m-0 font-sans">
                Play tracks in Nocturne to build your personal offline stats.
              </p>
            </div>
          ) : (
            <>
              {/* Weekly Listening Hours Chart */}
              <div className="ns-card shrink-0">
                <div className="label text-[13px] font-semibold text-[#e8eaf0] mb-3">
                  Weekly Listening Hours (Sat – Fri)
                </div>
                <WeekBars data={data.weekBars} todayIndex={data.todayIndex} />
              </div>

              {/* 2-Column Top Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
                <TopList title="Top Artists" items={data.topArtists} />
                <TopList title="Top Tracks" items={data.topTracks} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default StatsDashboard
