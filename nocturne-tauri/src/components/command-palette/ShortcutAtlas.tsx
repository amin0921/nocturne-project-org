import React, { useMemo, useState } from 'react'
import { SHORTCUT_ATLAS_GROUPS } from './commands'
import { KbdSequence } from './Kbd'
import { Search } from 'lucide-react'

export interface ShortcutAtlasProps {
  onSelectAction?: (actionId: string) => void
}

export const ShortcutAtlas: React.FC<ShortcutAtlasProps> = () => {
  const [filterQuery, setFilterQuery] = useState('')

  const filteredGroups = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return SHORTCUT_ATLAS_GROUPS

    return SHORTCUT_ATLAS_GROUPS.map((group) => {
      const matchingItems = group.items.filter((item) => {
        const title = item.title.toLowerCase()
        const desc = (item.description || '').toLowerCase()
        const keys = item.shortcut.join(' ').toLowerCase()
        return title.includes(q) || desc.includes(q) || keys.includes(q)
      })
      return {
        ...group,
        items: matchingItems
      }
    }).filter((group) => group.items.length > 0)
  }, [filterQuery])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Quick filter input — seamless, borderless bar (matches CommandPalette search) */}
      <div className="relative flex items-center border-b border-white/5 -mx-4 -mt-4 px-4 py-3 bg-[#0d0f15]">
        <Search size={16} className="text-amber-500/80 shrink-0" aria-hidden />
        <input
          type="text"
          autoFocus
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter shortcuts (e.g. volume, Space, navigation)..."
          className="w-full bg-transparent px-3 text-xs text-ink placeholder:text-faint/60 focus:outline-none"
        />
      </div>

      {/* Atlas Groups Container */}
      <div className="max-h-[52vh] overflow-y-auto nc-scroll-container pr-1 pl-1">
        {filteredGroups.length === 0 ? (
          <div className="py-12 text-center text-xs text-faint">
            No shortcuts match that filter.
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between">
                <h3 className="px-3 pb-1 pt-4 text-[11px] font-bold tracking-[0.2em] text-white/40 uppercase">
                  {group.title}
                </h3>
                <span className="px-3 pb-1 pt-4 text-[10px] text-faint uppercase tracking-wider font-mono">
                  {group.items.length} keys
                </span>
              </div>
              <div className="mx-3 border-b border-white/5" />

              <div className="divide-y divide-white/[0.04]">
                {group.items.map((item, idx) => (
                  <div
                    key={`${group.id}-${idx}`}
                    className="flex items-center justify-between py-2 px-3 hover:bg-white/[0.02] rounded transition-colors"
                  >
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-xs font-medium text-ink">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="text-[11px] text-faint">
                          {item.description}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 ml-3">
                      <KbdSequence keys={item.shortcut} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
