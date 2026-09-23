import React from 'react'
import {
  ListMusic,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward
} from 'lucide-react'
import {
  cycleRepeat,
  next,
  prev,
  seekTo,
  togglePlay,
  toggleShuffle,
  usePlayerStore
} from '../stores/usePlayerStore'
import { useUIStore } from '../stores/useUIStore'
import { cn, formatTime } from '../lib/utils'
import { Button } from './ui/button'
import { WaveformSeeker } from './WaveformSeeker'
import { VinylOrbit } from './VinylOrbit'
import { Marquee } from './Marquee'
import { PlayPauseButton } from './PlayPauseButton'
import { FavoriteButton } from './FavoriteButton'
import { VolumeCapsule } from './VolumeCapsule'

export interface PlayerBarProps {
  onOpenCoverView?: () => void
}

export default function PlayerBar({ onOpenCoverView }: PlayerBarProps = {}): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const mode = usePlayerStore((s) => s.mode)
  const playbackError = usePlayerStore((s) => s.playbackError)
  const toggleQueue = useUIStore((s) => s.toggleQueue)

  const hasTrack = currentTrack !== null
  const shuffleOn = mode === 'shuffle'
  const repeatLabel =
    mode === 'normal' ? 'Repeat: off' : mode === 'repeat-all' ? 'Repeat: all' : 'Repeat: one'

  const progress = duration && duration > 0 ? currentTime / duration : 0

  return (
    <div
      className="flex h-16 w-full items-center justify-between gap-3 px-4 md:px-5 select-none"
      aria-label="Playback controls"
    >
      {/* Playback Controls (Shuffle, Prev, Play/Pause, Next, Repeat) */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => toggleShuffle()}
          disabled={!hasTrack}
          aria-pressed={shuffleOn}
          aria-label="Shuffle"
          title={shuffleOn ? 'Disable shuffle' : 'Enable shuffle'}
          className={cn(
            'relative h-9 w-9 text-muted transition-all duration-150 hover:text-ink',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
            shuffleOn && 'text-ember drop-shadow-[0_0_8px_rgba(234,179,8,0.5)] hover:text-ember'
          )}
        >
          <Shuffle size={16} aria-hidden />
          {shuffleOn && (
            <span
              className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-ember shadow-[0_0_6px_rgba(234,179,8,0.9)]"
              aria-hidden="true"
            />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => void prev()}
          disabled={!hasTrack}
          aria-label="Previous track"
          title="Previous"
          className="h-9 w-9 text-muted hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
        >
          <SkipBack size={17} aria-hidden />
        </Button>

        {/* Category 1 Micro-Interaction: Smooth SVG Play/Pause morph */}
        <PlayPauseButton
          isPlaying={isPlaying}
          onClick={() => void togglePlay()}
          disabled={!hasTrack}
        />

        <Button
          size="icon"
          variant="ghost"
          onClick={() => void next()}
          disabled={!hasTrack}
          aria-label="Next track"
          title="Next"
          className="h-9 w-9 text-muted hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
        >
          <SkipForward size={17} aria-hidden />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => cycleRepeat()}
          disabled={!hasTrack}
          aria-label={repeatLabel}
          title={repeatLabel}
          aria-pressed={mode !== 'normal'}
          className={cn(
            'relative h-9 w-9 text-muted transition-all duration-150 hover:text-ink',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
            mode !== 'normal' && 'text-ember drop-shadow-[0_0_8px_rgba(234,179,8,0.5)] hover:text-ember'
          )}
        >
          {mode === 'repeat-one' ? <Repeat1 size={16} aria-hidden /> : <Repeat size={16} aria-hidden />}
          {mode !== 'normal' && (
            <span
              className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-ember shadow-[0_0_6px_rgba(234,179,8,0.9)]"
              aria-hidden="true"
            />
          )}
        </Button>
      </div>

      {/* Middle Waveform Seeker with Elapsed/Total Timestamps */}
      <div className="flex min-w-0 flex-1 items-center px-2 md:px-3 gap-3">
        {playbackError && (
          <span
            role="alert"
            title={playbackError}
            className="mr-2 flex max-w-56 shrink-0 items-center gap-1.5 text-ember"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3 2.5 20h19L12 3z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="12" x2="12" y1="9.5" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="16.8" r="1.1" fill="currentColor" />
            </svg>
            <span className="truncate text-[11px]">Playback stopped (hover for details)</span>
          </span>
        )}
        {hasTrack ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="numeric w-10 shrink-0 text-right text-xs font-medium text-muted">
              {formatTime(currentTime)}
            </span>
            <WaveformSeeker
              progress={progress}
              currentTime={currentTime}
              duration={duration ?? 0}
              isPlaying={isPlaying}
              onSeek={(ratio) => seekTo(ratio * (duration ?? 0))}
            />
            <span className="numeric w-10 shrink-0 text-left text-xs font-medium text-faint">
              {formatTime(duration)}
            </span>
          </div>
        ) : (
          <p className="truncate px-2 text-center w-full text-xs text-faint">
            Select a track to start listening
          </p>
        )}
      </div>

      {/* Right Section: VinylOrbit Thumbnail + Track info + Queue Toggle + Volume */}
      <div className="flex shrink-0 items-center justify-end gap-3">
        {/* Up next queue toggle for screens where queue is collapsed */}
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleQueue}
          aria-label="Toggle play queue"
          title="Up next queue"
          className="h-9 w-9 text-muted hover:text-ink lg:hidden focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40"
        >
          <ListMusic size={17} aria-hidden />
        </Button>

        {/* VinylOrbit Thumbnail with Cover Flow Modal Trigger */}
        <div className="relative pr-5 mr-1" title="Cover View (3D Carousel)">
          <VinylOrbit
            size={46}
            isPlaying={isPlaying}
            coverUrl={currentTrack?.coverUrl}
            title={currentTrack?.title ?? 'Nocturne'}
            artist={currentTrack?.artist ?? 'Offline Player'}
            onClick={hasTrack ? onOpenCoverView : undefined}
          />
        </div>

        {hasTrack && (
          <div className="hidden max-w-36 lg:max-w-48 flex-col text-left xl:flex min-w-0" aria-label="Now playing">
            <Marquee dir="auto" align="left" className="text-xs font-semibold text-ink">
              {currentTrack.title}
            </Marquee>
            <Marquee dir="auto" align="left" className="text-[11px] text-faint">
              {currentTrack.artist}
            </Marquee>
          </div>
        )}

        {/* Favorite (Like) Heart Micro-Interaction */}
        {hasTrack && (
          <FavoriteButton trackId={currentTrack.id} />
        )}

        {/* Category 4: Morphing Floating Volume Capsule */}
        <VolumeCapsule />
      </div>
    </div>
  )
}

