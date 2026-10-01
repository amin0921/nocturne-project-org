import React from 'react'
import { useUIStore } from '../stores/useUIStore'
import { QueuePanel, type QueuePanelProps } from './QueuePanel'
import { cn } from '../lib/utils'

type QueueSheetProps = Pick<QueuePanelProps, 'onTrackContextMenu' | 'resolveTrack'>

/**
 * QueueSheet Component
 * Responsive slide-over wrapper around QueuePanel for screens < 1024px.
 */
export function QueueSheet({ onTrackContextMenu, resolveTrack }: QueueSheetProps): JSX.Element {
  const queueOpen = useUIStore((s) => s.queueOpen)
  const setQueueOpen = useUIStore((s) => s.setQueueOpen)

  return (
    <>
      {queueOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setQueueOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'queue-sheet island lg:hidden',
          queueOpen && 'open'
        )}
        aria-hidden={!queueOpen}
      >
        <QueuePanel
          onClose={() => setQueueOpen(false)}
          onTrackContextMenu={onTrackContextMenu}
          resolveTrack={resolveTrack}
        />
      </div>
    </>
  )
}

export default QueueSheet
