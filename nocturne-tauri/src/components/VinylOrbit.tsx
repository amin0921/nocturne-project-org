import React, { useState, useEffect } from 'react'
import { Disc3 } from 'lucide-react'
import { resolveCoverUrl } from '../utils/cover-url'
import { cn } from '../lib/utils'

export interface VinylOrbitProps {
  isPlaying: boolean
  coverUrl?: string
  title: string
  artist: string
  /** px. Default 168. */
  size?: number
  onClick?: () => void
  className?: string
}

/**
 * VinylOrbit Component
 * Pure CSS high-fidelity grooved vinyl disc with gold Nocturne center label.
 * Slides out from behind sleeve when playing (translateX 38%), parked behind sleeve when paused (translateX 7%).
 * Spins at authentic 33⅓ rpm and freezes in place mid-rotation on pause.
 */
export function VinylOrbit({
  isPlaying,
  coverUrl,
  title,
  artist,
  size = 168,
  onClick,
  className
}: VinylOrbitProps): JSX.Element {
  const isCompact = size < 100
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [coverUrl])

  const resolvedSrc = !imgError ? resolveCoverUrl(coverUrl) : undefined

  return (
    <div
      onClick={(e) => {
        if (onClick) {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }
      }}
      className={cn(
        'relative shrink-0 select-none',
        onClick && 'cursor-pointer group',
        className
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={isPlaying ? `Now playing: ${title} by ${artist}` : `${title} by ${artist}`}
    >
      {/* ---- the disc: sits BEHIND the sleeve, slides out on play ---- */}
      <div
        aria-hidden
        className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none"
        style={{ transform: isPlaying ? 'translateX(38%)' : 'translateX(7%)' }}
      >
        <div
          className="animate-vinyl-spin relative h-full w-full rounded-full"
          style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
        >
          {/* vinyl body: grooves + light sheen, pure CSS */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `
                conic-gradient(from 200deg, rgba(255,255,255,0.12), transparent 22%, transparent 48%, rgba(255,255,255,0.07) 62%, transparent 80%, rgba(255,255,255,0.12)),
                repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 4px),
                radial-gradient(circle at 50% 50%, #17181d 0%, #0b0c0e 70%, #060607 100%)`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)'
            }}
          />
          {/* center label */}
          <div className="absolute left-1/2 top-1/2 aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#EAB308] to-[#a16207] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)] flex items-center justify-center">
            <span
              className="font-bold uppercase tracking-widest text-black/80 select-none text-center"
              style={{ fontSize: `${Math.max(5, Math.floor(size * 0.08))}px` }}
            >
              NOCTURNE
            </span>
          </div>
          {/* spindle hole */}
          <div className="absolute left-1/2 top-1/2 size-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#060607] shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_0_0_2px_rgba(255,255,255,0.12)]" />
        </div>
      </div>

      {/* ---- the sleeve: stays on top ---- */}
      <div
        className={cn(
          'absolute inset-0 z-10 overflow-hidden rounded-xl border border-white/10 bg-[#121419] shadow-2xl transition-all duration-200',
          onClick && 'group-hover:border-ember/50 group-hover:scale-[1.02]'
        )}
      >
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt=""
            draggable={false}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
            <Disc3
              size={Math.max(16, Math.floor(size * 0.4))}
              className="text-[#94A3B8]/60 transition-transform group-hover:text-ember"
            />
          </div>
        )}
        {!isCompact && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
            <p dir="auto" className="truncate text-xs font-medium text-[#F2F3F5]">
              {title}
            </p>
            <p dir="auto" className="truncate text-[10px] text-[#94A3B8]">
              {artist}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default VinylOrbit
