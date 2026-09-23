import React, { useState, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { toggleFavorite, usePlayerStore } from '../stores/usePlayerStore'
import { cn } from '../lib/utils'

export interface FavoriteButtonProps {
  trackId?: number | null
  className?: string
}

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315]

/**
 * FavoriteButton Component
 * Category 1 Transport Micro-Interaction.
 * Interactive Like (Heart) button with elastic pop and amber particle spark burst.
 * Persists favorite state across sessions and respects prefers-reduced-motion.
 */
export function FavoriteButton({ trackId, className }: FavoriteButtonProps): JSX.Element {
  const isFav = usePlayerStore((s) => (trackId ? s.favorites.has(trackId) : false))
  const [isBursting, setIsBursting] = useState(false)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!trackId) return

      const nowFav = toggleFavorite(trackId)
      if (nowFav) {
        setIsBursting(true)
        setTimeout(() => setIsBursting(false), 550)
      }
    },
    [trackId]
  )

  if (!trackId) return <div className="w-8 h-8" />

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFav}
      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'group relative flex h-8 w-8 items-center justify-center rounded-lg',
        'transition-all duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EAB308]/40',
        className
      )}
    >
      {/* Radial particle spark burst */}
      {isBursting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible" aria-hidden="true">
          {SPARKS.map((deg, i) => {
            const rad = (deg * Math.PI) / 180
            const destX = `${Math.round(Math.cos(rad) * 16)}px`
            const destY = `${Math.round(Math.sin(rad) * 16)}px`
            return (
              <span
                key={i}
                className="animate-spark absolute h-1 w-1 rounded-full bg-ember shadow-[0_0_6px_rgba(234,179,8,0.8)]"
                style={
                  {
                    '--dest-x': destX,
                    '--dest-y': destY
                  } as React.CSSProperties
                }
              />
            )
          })}
        </div>
      )}

      {/* Heart Icon */}
      <Heart
        size={16}
        className={cn(
          'transition-all duration-200 pointer-events-none',
          isBursting && 'animate-heart-pop',
          isFav
            ? 'fill-ember text-ember drop-shadow-[0_0_8px_rgba(234,179,8,0.7)] scale-105'
            : 'text-faint hover:text-muted hover:scale-110 active:scale-95'
        )}
        aria-hidden="true"
      />
    </button>
  )
}

export default FavoriteButton

