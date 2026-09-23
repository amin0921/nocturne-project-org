import { useEffect, useState } from 'react'
import { FolderPlus, Search, X } from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'

export default function Header(): JSX.Element {
  const status = useLibraryStore((s) => s.status)
  const progress = useLibraryStore((s) => s.progress)
  const error = useLibraryStore((s) => s.error)
  const addFolderAndScan = useLibraryStore((s) => s.addFolderAndScan)
  const cancelScan = useLibraryStore((s) => s.cancelScan)
  const setSearch = useLibraryStore((s) => s.setSearch)

  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 150)
    return () => clearTimeout(timer)
  }, [query, setSearch])

  const scanning = status === 'scanning'
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.scanned / progress.total) * 100)) : 0

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-3 px-5">
        <span className="text-[13px] font-bold tracking-[0.18em] text-ink">NOCTURNE</span>
        <div className="relative mx-auto w-full max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
            }}
            placeholder="Search title, artist, album…  (Ctrl+K)"
            aria-label="Search library"
            className="h-9 w-full rounded-lg border border-line bg-raised pl-9 pr-8 text-sm text-ink placeholder:text-faint focus:border-linestrong focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {scanning ? (
          <button
            onClick={() => void cancelScan()}
            className="flex h-9 items-center rounded-lg border border-linestrong bg-raised px-4 text-sm font-medium text-ink hover:bg-line"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={() => void addFolderAndScan()}
            className="flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-base hover:bg-emberhover"
          >
            <FolderPlus size={15} aria-hidden />
            Add Folder
          </button>
        )}
      </div>
      <div className="h-0.5 w-full bg-surface" aria-hidden>
        {scanning && <div className="h-full bg-ember transition-[width]" style={{ width: `${pct}%` }} />}
      </div>
      <div className="flex h-6 items-center px-5 text-[11px] text-faint" role="status" aria-live="polite">
        {scanning &&
          (progress.total > 0
            ? `Scanning… ${progress.scanned}/${progress.total} • ${progress.skipped} skipped`
            : 'Scanning… reading folders')}
        {status === 'error' && error && <span className="text-[#FF6369]">{error}</span>}
      </div>
    </header>
  )
}
