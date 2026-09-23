import type {
  ScanProgress,
  ScanResult,
  TrackListItem,
  TracksListParams,
  TracksListResult
} from '../../../shared/api'

export type { ScanProgress, ScanResult, TrackListItem, TracksListParams, TracksListResult }

/** Mirror of the preload allowlist. Renderer talks to main only through this. */
export interface NocturneApi {
  getVersion: () => string
  library: {
    selectFolder: () => Promise<{ canceled: boolean; folderPath?: string }>
    scan: (folders?: string[]) => Promise<ScanResult>
    cancelScan: () => Promise<{ ok: boolean }>
    onScanProgress: (cb: (p: ScanProgress) => void) => () => void
  }
  tracks: {
    list: (params?: TracksListParams) => Promise<TracksListResult>
  }
}

declare global {
  interface Window {
    nocturne: NocturneApi
  }
}
