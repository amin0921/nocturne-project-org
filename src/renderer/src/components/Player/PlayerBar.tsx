import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { formatDuration } from '../../utils/format'

function Scrubber(): JSX.Element {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const seek = usePlayerStore((s) => s.seek)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragValue, setDragValue] = useState<number | null>(null)

  const total = duration ?? 0
  const shown = dragValue ?? currentTime
  const pct = total > 0 ? Math.min(100, (shown / total) * 100) : 0

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current
      if (!el || total <= 0) return 0
      const rect = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * total
    },
    [total]
  )

  useEffect(() => {
    if (dragValue === null) return
    const up = (): void => {
      seek(dragValue)
      setDragValue(null)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [dragValue, seek])

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">{formatDuration(shown)}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={total > 0 ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(shown)}
        aria-disabled={total <= 0}
        onPointerDown={(e) => {
          if (total <= 0) return
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          setDragValue(valueFromClientX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (dragValue !== null) setDragValue(valueFromClientX(e.clientX))
        }}
        onKeyDown={(e) => {
          if (total <= 0) return
          if (e.key === 'ArrowLeft') seek(currentTime - 5)
          else if (e.key === 'ArrowRight') seek(currentTime + 5)
          else if (e.key === 'Home') seek(0)
          else if (e.key === 'End' && duration !== null) seek(duration)
          else return
          e.preventDefault()
        }}
        className="group relative flex h-6 flex-1 cursor-pointer items-center focus:outline-none"
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-[#2A3140]" aria-hidden>
          <div className="h-full rounded-full bg-ink transition-[width] duration-100" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute h-3 w-3 rounded-full bg-ink opacity-0 shadow group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ left: `calc(${pct}% - 6px)` }}
          aria-hidden
        />
      </div>
      <span className="w-11 shrink-0 text-xs tabular-nums text-faint">{formatDuration(duration)}</span>
    </div>
  )
}

export default function PlayerBar(): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const mode = usePlayerStore((s) => s.mode)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)

  const hasTrack = currentTrack !== null
  const shuffleOn = mode === 'shuffle'
  const repeatLabel = mode === 'normal' ? 'Repeat: off' : mode === 'repeat-all' ? 'Repeat: all' : 'Repeat: one'

  const ctrlBtn =
    'flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'

  return (
    <footer className="border-t border-line bg-surface px-4 py-2" aria-label="Playback controls">
      <div className="flex items-center gap-2">
        <div className="flex w-56 shrink-0 items-center gap-1">
          <button
            onClick={() => toggleShuffle()}
            disabled={!hasTrack}
            aria-pressed={shuffleOn}
            aria-label="Shuffle"
            title="Shuffle (S)"
            className={`${ctrlBtn} ${shuffleOn ? 'text-ember hover:text-ember' : ''}`}
          >
            <Shuffle size={17} aria-hidden />
          </button>
          <button onClick={() => void prev()} disabled={!hasTrack} aria-label="Previous track" title="Previous (P)" className={ctrlBtn}>
            <SkipBack size={18} aria-hidden />
          </button>
          <button
            onClick={() => void togglePlay()}
            disabled={!hasTrack}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title="Play/Pause (Space)"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-base hover:bg-emberhover disabled:opacity-40"
          >
            {isPlaying ? <Pause size={20} aria-hidden /> : <Play size={20} className="ml-0.5" aria-hidden />}
          </button>
          <button onClick={() => void next()} disabled={!hasTrack} aria-label="Next track" title="Next (N)" className={ctrlBtn}>
            <SkipForward size={18} aria-hidden />
          </button>
          <button
            onClick={() => cycleRepeat()}
            disabled={!hasTrack}
            aria-label={repeatLabel}
            title={`${repeatLabel} (R)`}
            className={`${ctrlBtn} ${mode !== 'normal' ? 'text-ember hover:text-ember' : ''}`}
          >
            {mode === 'repeat-one' ? <Repeat1 size={17} aria-hidden /> : <Repeat size={17} aria-hidden />}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 items-center">
          {hasTrack ? (
            <Scrubber />
          ) : (
            <p className="truncate px-2 text-xs text-faint">Select a track to start listening</p>
          )}
        </div>
        <div className="flex w-56 shrink-0 items-center justify-end gap-2">
          {hasTrack && (
            <p className="hidden max-w-40 truncate text-xs text-muted lg:block" aria-label="Now playing">
              <span className="text-ink">{currentTrack.title}</span>
              <span className="text-faint"> — {currentTrack.artist}</span>
            </p>
          )}
          <button
            onClick={() => toggleMute()}
            disabled={!hasTrack}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            title="Mute (M)"
            className={ctrlBtn}
          >
            {isMuted || volume === 0 ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            disabled={!hasTrack}
            aria-label="Volume"
            className="h-1 w-24 cursor-pointer accent-[#EAB308] disabled:cursor-default disabled:opacity-40"
          />
        </div>
      </div>
    </footer>
  )
}
