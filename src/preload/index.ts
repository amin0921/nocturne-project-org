import { contextBridge, ipcRenderer } from 'electron'
import type {
  ScanProgress,
  ScanResult,
  TracksListParams,
  TracksListResult
} from '../shared/api'

// Minimal allowlist. Renderer must never touch fs, path, DB, or metadata libs.
contextBridge.exposeInMainWorld('nocturne', {
  getVersion: (): string => '0.0.1',
  library: {
    selectFolder: (): Promise<{ canceled: boolean; folderPath?: string }> =>
      ipcRenderer.invoke('library:selectFolder'),
    scan: (folders?: string[]): Promise<ScanResult> => ipcRenderer.invoke('library:scan', { folders }),
    cancelScan: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('library:cancelScan'),
    onScanProgress: (cb: (p: ScanProgress) => void): (() => void) => {
      const listener = (_event: unknown, progress: ScanProgress): void => cb(progress)
      ipcRenderer.on('library:scanProgress', listener as never)
      return () => ipcRenderer.removeListener('library:scanProgress', listener as never)
    }
  },
  tracks: {
    list: (params?: TracksListParams): Promise<TracksListResult> =>
      ipcRenderer.invoke('tracks:list', params ?? {})
  }
})
