import { modKey } from '../../lib/platform'

export type CommandCategory = 'transport' | 'playback' | 'navigation' | 'view' | 'window' | 'help'

export interface CommandItem {
  id: string
  title: string
  category: CommandCategory
  categoryLabel: string
  shortcut: string[]
  icon: string
  keywords: string[]
  actionId: string
}

export interface AtlasGroup {
  id: string
  title: string
  items: {
    title: string
    shortcut: string[]
    description?: string
  }[]
}

/**
 * Checks whether all characters in query appear in target in sequential order.
 */
function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0
  let ti = 0
  while (qi < query.length && ti < target.length) {
    if (query[qi] === target[ti]) {
      qi++
    }
    ti++
  }
  return qi === query.length
}

/**
 * High-performance scoring for command query matching:
 * startsWith title (100) > startsWith keyword (80) > includes title (60) >
 * includes keyword (40) > fuzzy match (20) > 0 (no match).
 */
export function scoreCommand(cmd: CommandItem, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 100 // Unfiltered natural rank

  const title = cmd.title.toLowerCase()
  const cat = cmd.categoryLabel.toLowerCase()
  const kw = cmd.keywords.map((k) => k.toLowerCase())

  if (title.startsWith(q)) return 100
  if (kw.some((k) => k.startsWith(q)) || cat.startsWith(q)) return 80
  if (title.includes(q)) return 60
  if (kw.some((k) => k.includes(q)) || cat.includes(q)) return 40
  if (fuzzyMatch(q, title)) return 20

  return 0
}

export const STUDIO_COMMANDS: CommandItem[] = [
  {
    id: 'cmd-play',
    title: 'Play / Pause',
    category: 'transport',
    categoryLabel: 'Playback',
    shortcut: ['Space'],
    icon: 'Play',
    keywords: ['play', 'pause', 'resume', 'stop', 'start'],
    actionId: 'toggle-play'
  },
  {
    id: 'cmd-next',
    title: 'Next Track',
    category: 'transport',
    categoryLabel: 'Playback',
    shortcut: ['→'],
    icon: 'SkipForward',
    keywords: ['next', 'skip', 'forward', 'track'],
    actionId: 'next-track'
  },
  {
    id: 'cmd-prev',
    title: 'Previous Track',
    category: 'transport',
    categoryLabel: 'Playback',
    shortcut: ['←'],
    icon: 'SkipBack',
    keywords: ['prev', 'previous', 'back', 'track'],
    actionId: 'prev-track'
  },
  {
    id: 'cmd-mute',
    title: 'Toggle Mute',
    category: 'transport',
    categoryLabel: 'Audio',
    shortcut: ['M'],
    icon: 'VolumeX',
    keywords: ['mute', 'unmute', 'sound', 'volume', 'silent'],
    actionId: 'toggle-mute'
  },
  {
    id: 'cmd-shuffle',
    title: 'Toggle Shuffle',
    category: 'playback',
    categoryLabel: 'Playback Mode',
    shortcut: ['S'],
    icon: 'Shuffle',
    keywords: ['shuffle', 'random', 'order'],
    actionId: 'toggle-shuffle'
  },
  {
    id: 'cmd-repeat',
    title: 'Cycle Repeat',
    category: 'playback',
    categoryLabel: 'Playback Mode',
    shortcut: ['R'],
    icon: 'Repeat',
    keywords: ['repeat', 'loop', 'cycle'],
    actionId: 'cycle-repeat'
  },
  {
    id: 'cmd-stage',
    title: 'Go to Stage View',
    category: 'navigation',
    categoryLabel: 'Navigation',
    shortcut: [modKey(), '1'],
    icon: 'Disc3',
    keywords: ['stage', 'player', 'view', 'home', 'vinyl'],
    actionId: 'go-stage'
  },
  {
    id: 'cmd-library',
    title: 'Go to Library View',
    category: 'navigation',
    categoryLabel: 'Navigation',
    shortcut: [modKey(), '2'],
    icon: 'Library',
    keywords: ['library', 'tracks', 'songs', 'list', 'archive'],
    actionId: 'go-library'
  },
  {
    id: 'cmd-stats',
    title: 'آمار شنیداری / Listening Stats',
    category: 'navigation',
    categoryLabel: 'Navigation',
    shortcut: [modKey(), '3'],
    icon: 'BarChart3',
    keywords: ['stats', 'listening', 'charts', 'analytics', 'آمار', 'wrapped', 'replay'],
    actionId: 'go-stats'
  },
  {
    id: 'cmd-search',
    title: 'Search Library',
    category: 'navigation',
    categoryLabel: 'Search',
    shortcut: ['/'],
    icon: 'Search',
    keywords: ['search', 'find', 'filter', 'lookup'],
    actionId: 'focus-search'
  },
  {
    id: 'cmd-lyrics',
    title: 'Toggle Lyrics',
    category: 'view',
    categoryLabel: 'View',
    shortcut: ['L'],
    icon: 'Mic2',
    keywords: ['lyrics', 'words', 'text', 'lrc'],
    actionId: 'toggle-lyrics'
  },
  {
    id: 'cmd-coverflow',
    title: 'CoverFlow Showcase',
    category: 'view',
    categoryLabel: 'View',
    shortcut: ['C'],
    icon: 'Layers',
    keywords: ['cover', 'coverflow', '3d', 'carousel', 'art'],
    actionId: 'open-coverflow'
  },
  {
    id: 'cmd-cinema',
    title: 'استیج سینمایی / Cinema Stage',
    category: 'view',
    categoryLabel: 'View',
    shortcut: ['Shift', 'F'],
    icon: 'Maximize2',
    keywords: ['cinema', 'stage', 'immersive', 'fullscreen', 'سینما', 'استیج', 'glow'],
    actionId: 'open-cinema'
  },
  {
    id: 'cmd-mini',
    title: 'Toggle Mini-Island',
    category: 'window',
    categoryLabel: 'Window',
    shortcut: ['Shift', 'M'],
    icon: 'AppWindow',
    keywords: ['mini', 'island', 'pip', 'floating'],
    actionId: 'toggle-miniplayer'
  },
  {
    id: 'cmd-atlas',
    title: 'Shortcut Atlas',
    category: 'help',
    categoryLabel: 'Help',
    shortcut: ['?'],
    icon: 'Keyboard',
    keywords: ['atlas', 'keys', 'shortcuts', 'help', 'keyboard'],
    actionId: 'open-atlas'
  }
]

export const SHORTCUT_ATLAS_GROUPS: AtlasGroup[] = [
  {
    id: 'atlas-transport',
    title: 'Transport & Audio',
    items: [
      {
        title: 'Play / Pause',
        shortcut: ['Space'],
        description: 'Start or stop playback of the current track'
      },
      {
        title: 'Seek Forward (+5s)',
        shortcut: ['→'],
        description: 'Jump 5 seconds forward in the playing track'
      },
      {
        title: 'Seek Backward (-5s)',
        shortcut: ['←'],
        description: 'Jump 5 seconds backward in the playing track'
      },
      {
        title: 'Toggle Mute',
        shortcut: ['M'],
        description: 'Instantly mute or unmute the audio output'
      },
      {
        title: 'Toggle Shuffle',
        shortcut: ['S'],
        description: 'Randomize the playback queue order'
      },
      {
        title: 'Cycle Repeat',
        shortcut: ['R'],
        description: 'Cycle between repeat-one and repeat-all modes'
      }
    ]
  },
  {
    id: 'atlas-navigation',
    title: 'Navigation & Views',
    items: [
      {
        title: 'Stage View',
        shortcut: [modKey(), '1'],
        description: 'Return to the main stage and vinyl view'
      },
      {
        title: 'Library View',
        shortcut: [modKey(), '2'],
        description: 'Browse all tracks and search the library'
      },
      {
        title: 'Listening Stats',
        shortcut: [modKey(), '3'],
        description: 'View offline listening stats dashboard'
      },
      {
        title: 'Toggle Lyrics',
        shortcut: ['L'],
        description: 'Open the floating lyrics card synced to the music'
      },
      {
        title: '3D CoverFlow',
        shortcut: ['C'],
        description: 'Cinematic rotation across album covers'
      },
      {
        title: 'Mini-Island Mode',
        shortcut: ['Shift', 'M'],
        description: 'Move playback into the floating mini capsule'
      },
      {
        title: 'استیج سینمایی / Cinema Stage',
        shortcut: ['Shift', 'F'],
        description: 'Full-bleed immersive canvas with synced lyrics and ambient glow'
      }
    ]
  },
  {
    id: 'atlas-palette',
    title: 'Palette & System',
    items: [
      {
        title: 'Command Palette',
        shortcut: [modKey(), 'K'],
        description: 'Quick keyboard access to every studio command'
      },
      {
        title: 'Focus Search',
        shortcut: ['/'],
        description: 'Jump straight to the track search field'
      },
      {
        title: 'Shortcut Atlas',
        shortcut: ['?'],
        description: 'View the full shortcut reference'
      },
      {
        title: 'Close / Dismiss',
        shortcut: ['Esc'],
        description: 'Close the palette or the active dialog'
      }
    ]
  }
]
