import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)

export function useCountUp(target: number, duration = 1600) {
  const [value, setValue] = useState(0)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      setValue(target * easeOutCubic(p))
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible, target, duration])

  return { ref, value }
}

/** Formats number with US thousands separators in monospace/tabular numerals */
export function formatCount(n: number, decimals = 0): string {
  if (decimals > 0) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }
  return Math.round(n).toLocaleString('en-US')
}
