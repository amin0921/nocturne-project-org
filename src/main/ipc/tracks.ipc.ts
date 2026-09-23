import { ipcMain } from 'electron'
import type { TracksListParams } from '../../shared/api'
import { listTracks } from '../services/tracks-query'

/** Main-side handler. Renderer reaches it only via window.nocturne.tracks.list. */
export function registerTracksIpc(): void {
  ipcMain.handle('tracks:list', (_event, args?: TracksListParams) => {
    const params: TracksListParams = {
      search: typeof args?.search === 'string' ? args.search : undefined,
      sortBy: args?.sortBy,
      sortDir: args?.sortDir,
      limit: typeof args?.limit === 'number' ? args.limit : undefined,
      offset: typeof args?.offset === 'number' ? args.offset : undefined
    }
    return listTracks(params)
  })
}
