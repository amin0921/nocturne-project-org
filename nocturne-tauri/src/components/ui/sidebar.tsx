import { FolderOpen, Library, Music, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Card, CardContent } from './card'
import { Spinner } from './spinner'

export interface SidebarFolder {
  path: string
  trackCount: number
}

interface SidebarProps {
  totalTracks: number
  folders: SidebarFolder[]
  scanning: boolean
  onAddFolder: () => void
  onClearLibrary: () => void
}

/**
 * Left-hand desktop navigation. Detached floating dark glass island on Nocturne tokens.
 */
export function Sidebar({ totalTracks, folders, scanning, onAddFolder, onClearLibrary }: SidebarProps): JSX.Element {
  return (
    <aside
      aria-label="Library navigation"
      className="flex w-60 shrink-0 flex-col rounded-2xl border border-white/10 bg-[#121419]/95 shadow-2xl backdrop-blur-2xl overflow-hidden"
    >
      <nav aria-label="Sections" className="flex flex-col gap-1 p-3">
        <span className="px-2 pb-1 text-[11px] uppercase tracking-wider text-faint">Library</span>
        <div
          aria-current="page"
          className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-raised/80 px-3 py-2 text-sm font-medium text-ember shadow-sm"
        >
          <Library size={16} aria-hidden />
          <span className="flex-1">Tracks</span>
          <span
            aria-label={`${totalTracks} tracks`}
            className="rounded-full border border-white/10 bg-surface/60 px-2 py-0.5 text-[11px] tabular-nums text-muted"
          >
            {totalTracks}
          </span>
        </div>
      </nav>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2">
        <details open className="group/folders flex min-h-0 flex-col">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] uppercase tracking-wider text-faint hover:text-muted [&::-webkit-details-marker]:hidden">
            <FolderOpen size={14} aria-hidden />
            <span className="flex-1">Folders</span>
            <span className="tabular-nums">{folders.length}</span>
          </summary>
          <ul aria-label="Scanned folders" className="mt-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
            {folders.length === 0 && <li className="px-2 py-1 text-xs text-faint">No folders yet</li>}
            {folders.map((folder) => (
              <li
                key={folder.path}
                title={folder.path}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-white/[0.04] transition-colors"
              >
                <FolderOpen size={13} aria-hidden className="shrink-0 text-faint" />
                <span dir="auto" className="min-w-0 flex-1 truncate">
                  {folder.path}
                </span>
                <span className="shrink-0 tabular-nums text-faint">{folder.trackCount}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="flex flex-col gap-1 border-t border-white/5 p-3">
        <span className="px-2 pb-1 text-[11px] uppercase tracking-wider text-faint">Quick actions</span>
        <button
          type="button"
          onClick={onAddFolder}
          disabled={scanning}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-semibold text-base hover:bg-emberhover transition-colors',
            'disabled:opacity-50'
          )}
        >
          {scanning ? <Spinner size="xs" /> : <Plus size={15} aria-hidden />}
          <span>{scanning ? 'Scanning…' : 'Add Folder'}</span>
        </button>
        <button
          type="button"
          onClick={onClearLibrary}
          disabled={scanning || totalTracks === 0}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-faint hover:bg-raised/80 hover:text-ink disabled:opacity-50 transition-colors"
        >
          <Trash2 size={15} aria-hidden />
          Clear Library
        </button>
      </div>
      <NowPlayingCard />
    </aside>
  )
}

function NowPlayingCard(): JSX.Element {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  return (
    <div className="p-3 pt-0">
      <Card aria-label="Now playing" className="border-white/5 bg-raised/80 backdrop-blur-sm">
        <CardContent className="flex items-center gap-3 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-raised/80">
            <Music size={16} color={currentTrack ? '#EAB308' : '#6B7484'} aria-hidden />
          </span>
          {currentTrack ? (
            <span className="min-w-0 flex-1">
              <span dir="auto" className="block truncate text-[13px] font-medium text-ink">
                {currentTrack.title}
              </span>
              <span dir="auto" className="block truncate text-xs text-muted">
                {currentTrack.artist}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                <span className={cn('h-1.5 w-1.5 rounded-full', isPlaying ? 'bg-ember' : 'bg-linestrong')} aria-hidden />
                {isPlaying ? 'Playing' : 'Paused'}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-faint">Nothing playing</span>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
