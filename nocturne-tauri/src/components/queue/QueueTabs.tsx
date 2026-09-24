import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

/**
 * QueueTabs — studio tab strip with a measured, GPU-composited sliding pill.
 *
 * The pill position is read from the active button's offsetLeft/offsetWidth
 * (physical pixels, so it stays correct regardless of label widths) inside a
 * layout effect + ResizeObserver, then applied as a transform/width transition.
 * Roving tabindex + ArrowLeft/ArrowRight move focus and selection together;
 * stopPropagation keeps the global seek hotkey from firing on tab navigation.
 */

export type QueueTabId = 'queue' | 'history' | 'specs'

interface TabDef {
  id: QueueTabId
  label: string
  panelId: string
}

const TABS: TabDef[] = [
  { id: 'queue', label: 'Queue', panelId: 'panel-queue' },
  { id: 'history', label: 'History', panelId: 'panel-history' },
  { id: 'specs', label: 'Specs', panelId: 'panel-specs' }
]

export interface QueueTabsProps {
  active: QueueTabId
  onChange: (tab: QueueTabId) => void
  queueCount: number
  historyCount: number
  className?: string
}

export function QueueTabs({
  active,
  onChange,
  queueCount,
  historyCount,
  className
}: QueueTabsProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Partial<Record<QueueTabId, HTMLButtonElement | null>>>({})
  const [pill, setPill] = useState({ x: 0, w: 0 })

  const measure = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const btn = list.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`)
    if (!btn) return
    setPill((prev) => {
      const x = btn.offsetLeft
      const w = btn.offsetWidth
      return prev.x === x && prev.w === w ? prev : { x, w }
    })
  }, [active])

  useLayoutEffect(() => {
    measure()
    const list = listRef.current
    if (!list) return
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(list)
    list.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => observer?.observe(el))
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    e.stopPropagation()
    const index = TABS.findIndex((t) => t.id === active)
    if (index < 0) return
    const next = e.key === 'ArrowRight'
      ? (index + 1) % TABS.length
      : (index - 1 + TABS.length) % TABS.length
    const target = TABS[next]
    onChange(target.id)
    buttonRefs.current[target.id]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Queue views"
      className={cn('nq-tabs', className)}
      onKeyDown={onKeyDown}
    >
      <span
        className="nq-pill"
        aria-hidden="true"
        style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
      />
      {TABS.map((tab) => {
        const isActive = tab.id === active
        const count = tab.id === 'queue' ? queueCount : tab.id === 'history' ? historyCount : undefined
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            data-tab={tab.id}
            data-active={isActive}
            aria-selected={isActive}
            aria-controls={tab.panelId}
            tabIndex={isActive ? 0 : -1}
            className="nq-tab"
            onClick={() => onChange(tab.id)}
          >
            <span className="nq-tab-label">{tab.label}</span>
            {count !== undefined && <span className="numeric nq-tab-count">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export default QueueTabs
