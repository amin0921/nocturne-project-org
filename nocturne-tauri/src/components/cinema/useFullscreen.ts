import { useCallback, useEffect, useState } from 'react'

export interface FullscreenControls {
  isFs: boolean
  enter: () => Promise<void>
  exit: () => Promise<void>
  toggle: () => Promise<void>
}

/**
 * Manages document fullscreen state via the standard Web Fullscreen API.
 * Synchronizes boolean `isFs` across native window and browser events.
 */
export function useFullscreen(targetRef?: React.RefObject<HTMLElement | null>): FullscreenControls {
  const [isFs, setIsFs] = useState<boolean>(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const handleFsChange = () => {
      setIsFs(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
    }
  }, [])

  const enter = useCallback(async () => {
    try {
      const el = targetRef?.current ?? document.documentElement
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen()
      }
    } catch (err) {
      console.debug('Failed to enter fullscreen:', err)
    }
  }, [targetRef])

  const exit = useCallback(async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.debug('Failed to exit fullscreen:', err)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await exit()
    } else {
      await enter()
    }
  }, [enter, exit])

  return { isFs, enter, exit, toggle }
}
