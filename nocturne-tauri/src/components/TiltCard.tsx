import React, { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

export interface TiltCardProps {
  children: React.ReactNode
  className?: string
  /** Maximum rotation angle in degrees. Default 8. */
  maxTilt?: number
  /** Scale on hover. Default 1.02. */
  scale?: number
  /** Perspective distance in px. Default 1000. */
  perspective?: number
}

/**
 * TiltCard Component
 * Pure React + CSS 3D interactive tilt effect.
 * Smoothly tilts toward cursor position on hover (clamped to ±maxTilt deg),
 * and gracefully returns to resting state on leave using a cubic-bezier transition.
 * Automatically disabled under prefers-reduced-motion.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 8,
  scale = 1.02,
  perspective = 1000
}: TiltCardProps): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState<string>('')
  const [isHovered, setIsHovered] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reducedMotion || !cardRef.current) return

      const card = cardRef.current
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const centerX = rect.width / 2
      const centerY = rect.height / 2

      // Calculate tilt angles:
      // Mouse above center -> tilt top toward user (rotateX > 0)
      // Mouse right of center -> tilt right away from user (rotateY > 0)
      const rotateX = Math.max(-maxTilt, Math.min(maxTilt, ((centerY - y) / centerY) * maxTilt))
      const rotateY = Math.max(-maxTilt, Math.min(maxTilt, ((x - centerX) / centerX) * maxTilt))

      setTransform(
        `perspective(${perspective}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`
      )
      setIsHovered(true)
    },
    [maxTilt, scale, perspective, reducedMotion]
  )

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    setTransform(`perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`)
  }, [perspective])

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: reducedMotion ? 'none' : transform || undefined,
        transformStyle: 'preserve-3d',
        transition: isHovered
          ? 'transform 100ms ease-out'
          : 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)'
      }}
      className={cn('relative will-change-transform', className)}
    >
      {children}
    </div>
  )
}

export default TiltCard
