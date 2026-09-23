import { app, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import { registerSafeFileProtocol, SAFE_FILE_SCHEME } from './protocol/safe-file'
import { registerLibraryIpc } from './ipc/library.ipc'
import { registerTracksIpc } from './ipc/tracks.ipc'
import { initDb, selfTestDb } from './services/db'

protocol.registerSchemesAsPrivileged([
  { scheme: SAFE_FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0A0B0E',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  try {
    initDb()
    if (!app.isPackaged) {
      const { schemaVersionRows } = selfTestDb()
      console.log(`[nocturne] db self-test OK — schema_version rows: ${schemaVersionRows}`)
    }
  } catch (err) {
    console.error('[nocturne] db init failed', err)
  }
  registerLibraryIpc(() => mainWindow)
  registerTracksIpc()
  registerSafeFileProtocol()
  mainWindow = createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
