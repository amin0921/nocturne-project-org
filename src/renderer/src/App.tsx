import { useEffect } from 'react'
import Header from './components/Header/Header'
import TrackList from './components/TrackList/TrackList'
import PlayerBar from './components/Player/PlayerBar'
import { useLibraryStore } from './stores/useLibraryStore'

export default function App(): JSX.Element {
  useEffect(() => {
    const off = window.nocturne.library.onScanProgress((p) => {
      useLibraryStore.getState().setProgress(p)
    })
    void useLibraryStore.getState().refresh()
    return off
  }, [])

  return (
    <div className="flex h-screen flex-col bg-base text-ink">
      <Header />
      <main className="flex min-h-0 flex-1">
        <TrackList />
      </main>
      <PlayerBar />
    </div>
  )
}
