import { FolderPlus, LayoutDashboard, Library, Music, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface DockItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number
  action?: 'stage' | 'library' | 'add-folder' | 'cover-view'
}

export const DOCK_ITEMS: DockItem[] = [
  {
    id: 'stage',
    label: 'Stage',
    icon: LayoutDashboard,
    action: 'stage'
  },
  {
    id: 'library',
    label: 'Library',
    icon: Library,
    action: 'library'
  },
  {
    id: 'cover',
    label: 'CoverFlow',
    icon: Sparkles,
    action: 'cover-view'
  },
  {
    id: 'add-folder',
    label: 'Add Music',
    icon: FolderPlus,
    action: 'add-folder'
  }
]
