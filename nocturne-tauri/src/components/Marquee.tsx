import React, { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

export interface MarqueeProps {
  children: React.ReactNode
  className?: string
  /** Pixels per second. Default 30. */
  speed?: number
  /** Pause scrolling on mouse hover. Default true. */
  pauseOnHover?: boolean
  /** Gap between duplicated text in px. Default 36. */
  gap?: number
  /** Base text direction. Default 'auto'. */
  dir?: 'auto' | 'ltr' | 'rtl'
  /** Alignment when text does not overflow. Default 'center'. */
  align?: 'center' | 'left'
}

/**
 * Marquee Component
 * Smooth GPU-accelerated text ticker for long titles and artists exceeding container bounds.
 * If text fits comfortably, remains static without animation overhead.
 * If text overflows, smoothly loops seamlessly with pause-on-hover and edge fade masks.
 */
export function Marquee({
  children,
  className,
  speed = 30,
  pauseOnHover = true,
  gap = 36,
  dir = 'auto',
  align = 'center'
}: MarqueeProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [duration, setDuration] = useState(16)

  useEffect(() => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) return

    const measure = () => {
      const textWidth = text.getBoundingClientRect().width
      const containerWidth = container.getBoundingClientRect().width
      const overflows = textWidth > containerWidth + 2

      setIsOverflowing(overflows)
      if (overflows) {
        const totalDistance = textWidth + gap
        const calculatedDuration = Math.max(6, totalDistance / speed)
        setDuration(calculatedDuration)
      }
    }

    measure()

    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(container)
    observer.observe(text)

    return () => observer.disconnect()
  }, [children, speed, gap])

  return (
    <div
      ref={containerRef}
      style={{ direction: 'ltr' }}
      className={cn(
        'group relative flex min-w-0 max-w-full overflow-hidden select-none',
        isOverflowing
          ? 'justify-start [mask-image:linear-gradient(to_right,transparent_0%,black_14px,black_calc(100%-14px),transparent_100%)]'
          : align === 'center'
            ? 'justify-center'
            : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center',
          isOverflowing && 'animate-marquee',
          pauseOnHover && isOverflowing && 'group-hover:[animation-play-state:paused]'
        )}
        style={
          isOverflowing
            ? ({
                '--marquee-duration': `${duration}s`,
                paddingRight: `${gap}px`
              } as React.CSSProperties)
            : undefined
        }
      >
        <span
          ref={textRef}
          dir={dir}
          className="whitespace-nowrap shrink-0"
        >
          {children}
        </span>
      </div>

      {isOverflowing && (
        <div
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center animate-marquee',
            pauseOnHover && 'group-hover:[animation-play-state:paused]'
          )}
          style={
            {
              '--marquee-duration': `${duration}s`,
              paddingRight: `${gap}px`
            } as React.CSSProperties
          }
        >
          <span dir={dir} className="whitespace-nowrap shrink-0">
            {children}
          </span>
        </div>
      )}
    </div>
  )
}

export default Marquee
