import { useEffect, useRef, useState } from 'react'

/**
 * 2000ms idle detection with 250ms throttled user activity listener.
 * Detects mousemove, mousedown, keydown, and touchstart.
 * Returns boolean `idle` state to toggle auto-hiding of control bars and cursor.
 */
export function useIdle(timeoutMs = 2000, throttleMs = 250): boolean {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActiveRef = useRef<number>(Date.now())

  useEffect(() => {
    const resetTimer = () => {
      setIdle(false)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setIdle(true)
      }, timeoutMs)
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastActiveRef.current >= throttleMs) {
        lastActiveRef.current = now
        resetTimer()
      }
    }

    // Initialize timer
    resetTimer()

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'] as const
    events.forEach((evt) => {
      window.addEventListener(evt, onActivity, { passive: true })
    })

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      events.forEach((evt) => {
        window.removeEventListener(evt, onActivity)
      })
    }
  }, [timeoutMs, throttleMs])

  return idle
}
