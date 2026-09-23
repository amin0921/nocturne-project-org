import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'

// Window demux (Step 79): each webview loads index.html — branch on the
// Tauri window label so the mini-island never evaluates the App tree
// (usePlayerStore module bottom wires the audio controller + COMMAND bridge;
// a static App import would risk a second HTMLAudioElement in this window).
function resolveWindowLabel(): string {
  try {
    return getCurrentWindow().label
  } catch {
    return 'main'
  }
}

const windowLabel = resolveWindowLabel()

const Root = lazy(() =>
  windowLabel === 'mini-island'
    ? import('./components/MiniIsland/MiniIslandApp')
    : import('./App')
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>
)
