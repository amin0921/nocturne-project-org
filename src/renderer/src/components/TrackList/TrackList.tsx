import { FolderPlus, Music2 } from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { formatDuration } from '../../utils/format'

function ActiveIndicator({ playing }: { playing: boolean }): JSX.Element {
  return (
    <span className={`flex h-4 items-end gap-[3px] ${playing ? '' : 'eq-paused'}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-full bg-ember"
          style={{ height: '100%', animationDelay: `${i * 0.22}s` }}
        />
      ))}
    </span>
  )
}

export default function TrackList(): JSX.Element {
  const tracks = useLibraryStore((s) => s.tracks)
  const total = useLibraryStore((s) => s.total)
  const status = useLibraryStore((s) => s.status)
  const addFolderAndScan = useLibraryStore((s) => s.addFolderAndScan)
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const playTracks = usePlayerStore((s) => s.playTracks)

  if (tracks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-raised">
          <Music2 size={28} color="#EAB308" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold text-ink">
          {status === 'scanning' ? 'Listening for music…' : 'Your night starts quiet'}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          {status === 'scanning'
            ? 'Tracks appear here as the scan finds them.'
            : 'Add a music folder to build your offline library. MP3 · WAV · M4A. No login. No cloud.'}
        </p>
        {status !== 'scanning' && (
          <button
            onClick={() => void addFolderAndScan()}
            className="mt-1 flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-base hover:bg-emberhover"
          >
            <FolderPlus size={16} aria-hidden />
            Add Music Folder
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-line px-5 py-2 text-[11px] uppercase tracking-wider text-faint">
        {total} track{total === 1 ? '' : 's'}
      </div>
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Tracks">
        {tracks.map((track, index) => {
          const isActive = track.id === currentTrackId
          const isMissing = track.missing === 1
          return (
            <div
              key={track.id}
              role="option"
              aria-selected={isActive}
              aria-label={`${track.title} by ${track.artist}${isMissing ? ' (file missing)' : ''}`}
              title={isMissing ? 'File missing — moved or deleted' : `Play ${track.title}`}
              onClick={() => {
                if (!isMissing) void playTracks(tracks, index)
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isMissing) {
                  e.preventDefault()
                  void playTracks(tracks, index)
                }
              }}
              tabIndex={isMissing ? -1 : 0}
              className={`flex h-14 items-center gap-3 border-b border-line/50 px-5 hover:bg-raised ${
                isMissing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
              } ${isActive ? 'border-l-2 border-l-ember bg-raised pl-[18px]' : 'border-l-2 border-l-transparent'}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-base" aria-hidden>
                {isActive ? (
                  <ActiveIndicator playing={isPlaying} />
                ) : (
                  <Music2 size={15} color={isMissing ? '#6B7484' : '#A8B0BE'} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-medium ${isActive ? 'text-ember' : 'text-ink'}`}>
                  {track.title}
                </span>
                <span className="block truncate text-xs text-muted">
                  {track.artist} • {track.album}
                </span>
              </span>
              {isMissing && (
                <span className="shrink-0 rounded-full border border-linestrong px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint">
                  missing
                </span>
              )}
              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-faint">
                {formatDuration(track.durationSec)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
