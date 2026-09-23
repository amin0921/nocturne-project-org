import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { resolve } from 'path'
import { getDb } from '../services/db'
import { requestScanCancel, scanLibraryFolders } from '../services/scanner'

export const SCAN_PROGRESS_EVENT = 'library:scanProgress'

function sanitizeFolderList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => resolve(p))
    .slice(0, 64)
}

/** Main-side handlers. Renderer reaches them only via window.nocturne.library. */
export function registerLibraryIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('library:selectFolder', async () => {
    const win = getWindow()
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true as const }
    const folderPath = resolve(res.filePaths[0] as string)
    getDb()
      .prepare('INSERT OR IGNORE INTO folders (folderPath, dateAdded, enabled) VALUES (?, ?, 1)')
      .run(folderPath, Date.now())
    return { canceled: false as const, folderPath }
  })

  ipcMain.handle('library:scan', async (_event, args?: { folders?: string[] }) => {
    const win = getWindow()
    return scanLibraryFolders({
      folderPaths: sanitizeFolderList(args?.folders),
      onProgress: (progress) => win?.webContents.send(SCAN_PROGRESS_EVENT, progress)
    })
  })

  ipcMain.handle('library:cancelScan', () => {
    requestScanCancel()
    return { ok: true }
  })
}
