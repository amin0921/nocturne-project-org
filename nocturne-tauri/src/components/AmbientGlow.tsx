import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import { DEFAULT_PALETTE, AmbientPalette } from '../utils/colorExtractor'

export interface AmbientGlowProps {
  /** Dominant artwork tone — top-center emitter (under the Dynamic Island). */
  primary?: string
  /** Accent artwork tone — center-bottom emitter (under the artwork). */
  secondary?: string
  /** 0..1 master opacity. Default 0.55. */
  intensity?: number
  /** True while audio is playing — pauses breathing when false. */
  pulsing?: boolean
  className?: string
}

/** Append alpha to a #rrggbb hex color safely. */
function withAlpha(hex: string, alpha: number): string {
  const safeHex = hex.startsWith('#') ? hex.slice(1) : hex
  const fullHex = safeHex.length === 3 ? safeHex.split('').map((c) => c + c).join('') : safeHex
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${fullHex}${a}`
}

/** Soft radial emitter gradient fading to fully transparent by 78%. */
function emitterGradient(hex: string, centerAlpha: number, radiusPx: number, at: string): string {
  return `radial-gradient(circle ${radiusPx}px at ${at}, ${withAlpha(hex, centerAlpha)}, ${withAlpha(
    hex,
    centerAlpha * 0.35
  )} 55%, transparent 78%)`
}

const CROSS_FADE = 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1)'
const LAYER_BASE = 'pointer-events-none absolute'
/** Glow 1 — top-center, reaching up under the Dynamic Island. */
const TOP_EMITTER_POS = 'left-1/2 -top-[28%] h-[85%] w-[125%] -translate-x-1/2'
const TOP_EMITTER_RADIUS = 380
const TOP_EMITTER_AT = '50% 30%'
/** Glow 2 — center-bottom, pooling beneath the artwork. */
const BOTTOM_EMITTER_POS = 'left-1/2 -bottom-[22%] h-[70%] w-[110%] -translate-x-1/2'
const BOTTOM_EMITTER_RADIUS = 440
const BOTTOM_EMITTER_AT = '50% 70%'
/** Studio-grade optical dispersion — smooth, no hard emitter edges. */
const EMITTER_BLUR = 'blur(80px)'
/** Emitter 1 center alpha — calibrated 38%-42% band (0.40). */
const TOP_EMITTER_ALPHA = 0.4
/** Emitter 2 center alpha — calibrated 28%-32% band (0.30). */
const BOTTOM_EMITTER_ALPHA = 0.3

interface GlowBuffers {
  front: AmbientPalette
  back: AmbientPalette
  frontOnA: boolean
}

/**
 * AmbientGlow Component
 * Adaptive dual-emitter cinematic aura behind the stage artwork.
 * - Emitter 1 (top-center): primary artwork tone at 40% center opacity.
 * - Emitter 2 (center-bottom): secondary artwork tone at 30% center opacity.
 * - Wide 380px/440px radial circles + 80px optical blur for a lush,
 *   studio-grade bloom across the stage without hard edges.
 * - Palette changes cross-fade over 600ms via double-buffered opacity layers
 *   (background gradients are swapped only on the invisible layer, so there is
 *   never a hard cut — opacity-only transitions stay on the GPU compositor).
 * - Strictly additive over the solid #0D0F15 obsidian stage base; zero layout
 *   work, zero canvas repaints per frame, pointer-events-none throughout.
 */
export function AmbientGlow({
  primary = DEFAULT_PALETTE.primary,
  secondary = DEFAULT_PALETTE.secondary,
  intensity = 0.55,
  pulsing = true,
  className
}: AmbientGlowProps): JSX.Element {
  const palette = useMemo<AmbientPalette>(() => ({ primary, secondary }), [primary, secondary])

  // Double buffer: `front` is painted at opacity 1, `back` holds the previous
  // palette at opacity 0. On change we flip — the incoming layer receives its
  // new background and fades in while the outgoing layer fades out.
  const [buffers, setBuffers] = useState<GlowBuffers>({
    front: palette,
    back: palette,
    frontOnA: true
  })

  useEffect(() => {
    setBuffers((prev) => ({ front: palette, back: prev.front, frontOnA: !prev.frontOnA }))
  }, [palette])

  const aColors = buffers.frontOnA ? buffers.front : buffers.back
  const bColors = buffers.frontOnA ? buffers.back : buffers.front

  const layerStyle = (
    hex: string,
    centerAlpha: number,
    visible: boolean,
    radiusPx: number,
    at: string
  ): React.CSSProperties => ({
    background: emitterGradient(hex, centerAlpha, radiusPx, at),
    filter: EMITTER_BLUR,
    opacity: visible ? 1 : 0,
    transition: CROSS_FADE,
    willChange: 'opacity, transform'
  })

  return (
    <div
      aria-hidden
      className={cn('aura-pulse pointer-events-none absolute', className)}
      style={{
        willChange: 'transform, opacity',
        opacity: intensity,
        animationPlayState: pulsing ? 'running' : 'paused'
      }}
    >
      {/* Glow 1 — top-center / under island (primary, 40%) */}
      <div
        className={cn(LAYER_BASE, TOP_EMITTER_POS)}
        style={layerStyle(aColors.primary, TOP_EMITTER_ALPHA, buffers.frontOnA, TOP_EMITTER_RADIUS, TOP_EMITTER_AT)}
      />
      <div
        className={cn(LAYER_BASE, TOP_EMITTER_POS)}
        style={layerStyle(bColors.primary, TOP_EMITTER_ALPHA, !buffers.frontOnA, TOP_EMITTER_RADIUS, TOP_EMITTER_AT)}
      />

      {/* Glow 2 — center-bottom / under artwork (secondary, 30%) */}
      <div
        className={cn(LAYER_BASE, BOTTOM_EMITTER_POS)}
        style={layerStyle(aColors.secondary, BOTTOM_EMITTER_ALPHA, buffers.frontOnA, BOTTOM_EMITTER_RADIUS, BOTTOM_EMITTER_AT)}
      />
      <div
        className={cn(LAYER_BASE, BOTTOM_EMITTER_POS)}
        style={layerStyle(bColors.secondary, BOTTOM_EMITTER_ALPHA, !buffers.frontOnA, BOTTOM_EMITTER_RADIUS, BOTTOM_EMITTER_AT)}
      />
    </div>
  )
}

export default AmbientGlow
