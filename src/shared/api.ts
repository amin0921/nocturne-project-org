// Dependency-free shared contracts. Importable by main, preload, and renderer (types only).

export interface TrackListItem {
  id: number
  filePath: string
  title: string
  artist: string
  album: string
  durationSec: number | null
  missing: number
}

export interface ScanProgress {
  phase: 'walk' | 'parse'
  scanned: number
  total: number
  skippedUnsupported: number
  errors: number
}

export interface ScanResult {
  addedOrUpdated: number
  skippedUnsupported: number
  errors: number
  cancelled: boolean
}

export type TrackSortBy = 'title' | 'artist' | 'album' | 'durationSec' | 'dateAdded'
export type SortDir = 'asc' | 'desc'

export interface TracksListParams {
  search?: string
  sortBy?: TrackSortBy
  sortDir?: SortDir
  limit?: number
  offset?: number
}

export interface TracksListResult {
  tracks: TrackListItem[]
  total: number
}
