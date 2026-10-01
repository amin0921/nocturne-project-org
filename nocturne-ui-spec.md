# NOCTURNE — UI Component Specification

**Project:** Nocturne — high-performance, minimalist, dark-themed offline Windows desktop music player
**Stack:** Tauri v2 + Rust + Vite + React 18 + TypeScript + TailwindCSS + SQLite + Zustand
**Window:** Completely frameless (`decorations: false`), 100% transparent passthrough (`transparent: true`).
UI is structured as detached, floating dark-glass islands hovering over the Windows desktop.
**Dependency policy:** Pure React 18 + TailwindCSS + Lucide React. No Three.js / Babylon.js / heavy canvas bundles.
All 3D and motion in this spec is pure CSS 3D transforms, SVG, and GPU-composited gradients.

**Research grounding:** patterns surveyed on [shadcn/ui](https://ui.shadcn.com/docs/components)
(scroll-area, tooltip, carousel), [uiverse.io](https://uiverse.io) (self-contained CSS vinyl discs,
waveform bar loaders, glassmorphism pills), and [Magic UI](https://magicui.design)
(border-beam glow, shine borders, ambient background effects — re-implemented here in dependency-free CSS
per the project's no-heavy-libs policy). Vinyl spin/freeze behavior follows the proven production pattern of
freezing via `animation-play-state: paused` instead of resetting rotation
([reference spec](https://github.com/surco-app/surco/blob/HEAD/docs/superpowers/specs/2026-07-22-vinyl-player-cover-design.md)).

---

## 1. Design Tokens

| Token | Value | Usage |
|---|---|---|
| `--nocturne-void` | transparent | Base canvas — window passthrough negative space. Never paint it. |
| `--nocturne-glass` | `#121419` | Floating island surfaces (solid glass) |
| `--nocturne-ink` | `#F2F3F5` | Primary text |
| `--nocturne-muted` | `#94A3B8` | Secondary text, unplayed waveform bars (at 35% alpha) |
| `--nocturne-amber` | `#EAB308` | Accent / glow — played progress, active states |
| Island chrome | `backdrop-blur-xl` + `border border-white/10` + `rounded-2xl` | Standard island recipe |
| Layout | Standard **LTR** desktop layout | Song/artist names use scoped `dir="auto"`; durations, counters, timestamps use Latin digits + `dir="ltr"` |

Shared TypeScript types (put in `src/types/player.ts`):

```ts
export interface Track {
  id: string;
  title: string;      // may be Persian — render with dir="auto"
  artist: string;      // may be Persian — render with dir="auto"
  album?: string;
  duration: number;    // seconds — always render Latin digits, dir="ltr"
  coverUrl?: string;
  color?: string;      // dominant artwork color, e.g. "#EAB308" — drives AmbientGlow
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, "0");
  return `${m}:${rest}`; // Latin digits by construction
}
```

---

## 2. Global CSS — append to `src/index.css`

```css
/* ---------- Nocturne global ---------- */

/* Frameless transparent window: the canvas must stay see-through.
   Only floating islands carry surfaces. */
html, body, #root {
  background: transparent !important;
}

:root {
  --nocturne-glass: #121419;
  --nocturne-ink: #F2F3F5;
  --nocturne-muted: #94A3B8;
  --nocturne-amber: #EAB308;
  --vinyl-spin-duration: 1.8s; /* authentic 33⅓ rpm */
}

/* Numeric readouts: Latin digits, tabular figures, forced LTR */
.numeric {
  direction: ltr;
  unicode-bidi: embed;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* Thin scrollbars for queue / lyrics panes */
.nocturne-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.nocturne-scroll::-webkit-scrollbar-track { background: transparent; }
.nocturne-scroll::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 9999px;
}
.nocturne-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(234, 179, 8, 0.45);
}
.nocturne-scroll { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,.25) transparent; }

/* ---------- Keyframes ---------- */

/* Authentic 33⅓ rpm vinyl rotation. Freeze (don't reset) via animation-play-state. */
@keyframes vinyl-spin {
  to { transform: rotate(360deg); }
}

/* Breathing ambient aura behind active cards/capsules */
@keyframes aura-pulse {
  0%, 100% { transform: scale(1); opacity: 0.65; }
  50%      { transform: scale(1.09); opacity: 1; }
}

/* Gentle idle shimmer for waveform placeholder bars (no peaks data yet) */
@keyframes waveform-idle {
  0%, 100% { transform: scaleY(0.55); opacity: 0.5; }
  50%      { transform: scaleY(1); opacity: 1; }
}

/* Vinyl disc sliding out of its sleeve when playback starts */
@keyframes vinyl-slide-out {
  from { transform: translateX(6%); }
  to   { transform: translateX(38%); }
}

/* Soft ping for the dock's active indicator dot */
@keyframes dock-dot-ping {
  0%   { transform: scale(1); opacity: 0.9; }
  80%, 100% { transform: scale(2.4); opacity: 0; }
}

/* Helper classes (Tailwind arbitrary animate-[...] also works) */
.animate-vinyl-spin  { animation: vinyl-spin var(--vinyl-spin-duration) linear infinite; }
.aura-pulse          { animation: aura-pulse 4.5s ease-in-out infinite; will-change: transform, opacity; }
.waveform-idle-bar   { animation: waveform-idle 1.6s ease-in-out infinite; transform-origin: center; }

/* Respect users who prefer reduced motion: kill spin/pulse, keep layout */
@media (prefers-reduced-motion: reduce) {
  .animate-vinyl-spin,
  .aura-pulse,
  .waveform-idle-bar {
    animation: none !important;
  }
}
```

---

## 3. Component Blueprints

### Component 1 — `CoverFlowView` (3D CoverFlow Carousel)

**Purpose.** Apple-style CoverFlow reimagined as dark cosmic floating cards. The center card faces
forward; flanking cards angle *inwards* toward the center with progressive opacity, scale, and
z-index falloff. Pure CSS 3D (`perspective: 1200px`) — no 3D libraries.

**Props interface.**

```tsx
export interface CoverFlowViewProps {
  tracks: Track[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Called on Escape — parent returns to the normal library view. */
  onDismiss?: () => void;
  /** How many cards are visible on each side of the active card. Default 2. */
  visibleSiblings?: number;
}
```

**Implementation** (`src/components/CoverFlowView.tsx`):

```tsx
import { useCallback, useEffect, useRef } from "react";
import { Disc3 } from "lucide-react";
import type { Track } from "@/types/player";
import { cn } from "@/lib/utils";
import type { CoverFlowViewProps } from "./types";

const CARD = 200;      // px — card edge
const SPACING = 148;   // px — horizontal distance between card centers

export function CoverFlowView({
  tracks, activeIndex, onSelect, onDismiss, visibleSiblings = 2,
}: CoverFlowViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rootRef.current?.focus(); }, []);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(tracks.length - 1, i)),
    [tracks.length]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); onSelect(clamp(activeIndex + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); onSelect(clamp(activeIndex - 1)); }
    else if (e.key === "Escape") { onDismiss?.(); }
  };

  const activeId = tracks[activeIndex]?.id;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="listbox"
      aria-label="Album cover flow. Use left and right arrows to browse, Escape to close."
      aria-activedescendant={activeId ? `cover-${activeId}` : undefined}
      onKeyDown={onKeyDown}
      dir="ltr"
      className="relative h-[320px] w-full overflow-visible outline-none [perspective:1200px]"
    >
      {/* 3D stage, centered */}
      <div className="absolute left-1/2 top-1/2 h-0 w-0 [transform-style:preserve-3d]">
        {tracks.map((track, i) => {
          const offset = i - activeIndex;
          const abs = Math.abs(offset);
          if (abs > visibleSiblings) return null;
          const isActive = offset === 0;

          /* Inward angle: in LTR, cards LEFT of center tilt +35deg (face turns
             toward center), cards RIGHT of center tilt -35deg. */
          const rotateY = isActive ? 0 : offset < 0 ? 35 : -35;
          const scale = isActive ? 1.06 : Math.max(0.62, 0.88 - abs * 0.13);
          const opacity = isActive ? 1 : Math.max(0.25, 0.75 - abs * 0.25);

          return (
            <button
              key={track.id}
              id={`cover-${track.id}`}
              role="option"
              aria-selected={isActive}
              aria-label={`${track.title} by ${track.artist}`}
              onClick={() => onSelect(i)}
              className={cn(
                "absolute cursor-pointer overflow-hidden rounded-xl border bg-[#121419]",
                "transition-[transform,opacity,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EAB308]",
                isActive
                  ? "border-[#EAB308]/50 shadow-[0_0_70px_-12px_rgba(234,179,8,0.5)]"
                  : "border-white/10 shadow-2xl hover:border-white/25"
              )}
              style={{
                width: CARD,
                height: CARD,
                zIndex: 20 - abs,
                opacity,
                transform: `translate(-50%, -58%) translateX(${offset * SPACING}px) rotateY(${rotateY}deg) scale(${scale})`,
                transformStyle: "preserve-3d",
              }}
            >
              {track.coverUrl ? (
                <img src={track.coverUrl} alt="" draggable={false}
                  className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
                  <Disc3 className="size-12 text-[#94A3B8]/60" />
                </div>
              )}
              {/* caption strip */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-8">
                <p dir="auto" className="truncate text-[13px] font-medium text-[#F2F3F5]">{track.title}</p>
                <p dir="auto" className="truncate text-[11px] text-[#94A3B8]">{track.artist}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* position dots */}
      <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden>
        {tracks.map((t, i) => (
          <span key={t.id}
            className={cn("size-1.5 rounded-full transition-colors",
              i === activeIndex ? "bg-[#EAB308]" : "bg-white/20")} />
        ))}
      </div>
    </div>
  );
}
```

**Accessibility & bidi.**
- `role="listbox"` + `role="option"` + `aria-selected` + `aria-activedescendant`; container is focusable.
- ArrowLeft/ArrowRight move (LTR semantics), Escape dismisses.
- Titles/artists rendered with `dir="auto"` so Persian names shape correctly inside the LTR layout.
- Focus ring in amber (`focus-visible:ring-[#EAB308]`).

---

### Component 2 — `WaveformSeeker` (Interactive Waveform Seeker)

**Purpose.** Replaces the boring linear slider with a floating capsule of dynamic frequency bars.
Played bars glow ember amber; unplayed bars sit in muted translucent grey. Hover shows a scrub
preview with timestamp; click-and-drag seeks. Pure SVG — no canvas, no libraries.

**Props interface.**

```tsx
export interface WaveformSeekerProps {
  /** Normalized peaks, 0..1. If empty, renders an idle shimmer placeholder. */
  peaks: number[];
  /** Playback progress 0..1 */
  progress: number;
  currentTime: number;   // seconds
  duration: number;      // seconds
  isPlaying: boolean;
  onSeek: (ratio: number) => void;  // 0..1
}
```

**Implementation** (`src/components/WaveformSeeker.tsx`):

```tsx
import { useId, useRef, useState } from "react";
import { formatTime, type WaveformSeekerProps } from "@/types/player";
import { cn } from "@/lib/utils";

const VIEW_W = 600;
const VIEW_H = 64;
const BAR_COUNT = 72;

export function WaveformSeeker({
  peaks, progress, currentTime, duration, isPlaying, onSeek,
}: WaveformSeekerProps) {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelId = useId();

  const bars = peaks.length > 0 ? peaks : Array.from({ length: BAR_COUNT }, () => 0.5);
  const idle = peaks.length === 0;
  const slot = VIEW_W / bars.length;
  const barW = Math.max(1.5, slot * 0.55);

  const ratioFromEvent = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const previewRatio = hoverRatio ?? (scrubbing ? progress : null);

  return (
    <div className="group relative w-full select-none">
      {/* hover / scrub timestamp bubble */}
      {previewRatio !== null && (
        <div
          className="numeric pointer-events-none absolute -top-8 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-[#121419] px-2 py-0.5 text-[11px] text-[#EAB308]"
          style={{ left: `${previewRatio * 100}%` }}
        >
          {formatTime(previewRatio * duration)}
        </div>
      )}

      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        aria-orientation="horizontal"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(1, (currentTime + 5) / duration));
          else if (e.key === "ArrowLeft") onSeek(Math.max(0, (currentTime - 5) / duration));
          else if (e.key === "Home") onSeek(0);
          else if (e.key === "End") onSeek(1);
        }}
        className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#EAB308]"
      >
        <span id={labelId} className="sr-only">Seek</span>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block h-16 w-full"
          onMouseMove={(e) => setHoverRatio(ratioFromEvent(e.clientX))}
          onMouseLeave={() => setHoverRatio(null)}
          onPointerDown={(e) => {
            setScrubbing(true);
            (e.target as Element).setPointerCapture?.(e.pointerId);
            onSeek(ratioFromEvent(e.clientX));
          }}
          onPointerMove={(e) => { if (scrubbing) onSeek(ratioFromEvent(e.clientX)); }}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
        >
          {bars.map((peak, i) => {
            const centerRatio = (i + 0.5) / bars.length;
            const played = centerRatio <= progress;
            const h = Math.max(3, peak * (VIEW_H - 8));
            const x = i * slot + (slot - barW) / 2;
            const hovered = previewRatio !== null && centerRatio <= previewRatio;
            return (
              <rect
                key={i}
                x={x}
                y={(VIEW_H - h) / 2}
                width={barW}
                height={h}
                rx={barW / 2}
                className={cn(idle && "waveform-idle-bar")}
                style={idle ? { animationDelay: `${(i % 12) * 0.09}s` } : undefined}
                fill={played ? "#EAB308" : hovered ? "rgba(234,179,8,0.45)" : "rgba(148,163,184,0.35)"}
                opacity={played ? 1 : 0.9}
              />
            );
          })}
          {/* playhead */}
          <line
            x1={progress * VIEW_W} x2={progress * VIEW_W}
            y1={4} y2={VIEW_H - 4}
            stroke="#F2F3F5" strokeWidth={1.5} opacity={0.9}
          />
        </svg>
      </div>

      {/* played bars glow — one filter for the whole played region keeps it cheap */}
      <style>{`
        [role="slider"] rect[fill="#EAB308"] {
          filter: drop-shadow(0 0 5px rgba(234,179,8,0.65));
        }
      `}</style>
    </div>
  );
}
```

> **Peaks source (note for integrator):** decode once per track with `AudioContext.decodeAudioData`,
> downsample min/max pairs into ~72 buckets, store alongside the track row in SQLite (`peaks BLOB`).
> The component stays purely presentational.

**Accessibility & bidi.**
- Native `role="slider"` semantics: arrows ±5s, Home/End, full `aria-valuetext` ("1:23 of 4:56").
- Timestamp bubble uses `.numeric` (Latin digits, forced LTR) so `3:07` never flips inside RTL text.
- `prefers-reduced-motion` disables the idle shimmer via the global media query.

---

### Component 3 — `VinylOrbit` (Vinyl Disc Orbit Animation)

**Purpose.** A high-fidelity CSS vinyl disc that slides out from behind the album sleeve and spins
while playing. Grooves are layered gradients (no images); the center label carries the ember accent.
Freezes in place on pause (never snaps back to 0°); fully disabled under `prefers-reduced-motion`.

**Props interface.**

```tsx
export interface VinylOrbitProps {
  isPlaying: boolean;
  coverUrl?: string;
  title: string;
  artist: string;
  /** px. Default 168. */
  size?: number;
}
```

**Implementation** (`src/components/VinylOrbit.tsx`):

```tsx
import { Disc3 } from "lucide-react";
import type { VinylOrbitProps } from "./types";
import { cn } from "@/lib/utils";

export function VinylOrbit({ isPlaying, coverUrl, title, artist, size = 168 }: VinylOrbitProps) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={isPlaying ? `Now playing: ${title} by ${artist}` : `${title} by ${artist}`}
    >
      {/* ---- the disc: sits BEHIND the sleeve, slides out on play ---- */}
      <div
        aria-hidden
        className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: isPlaying ? "translateX(38%)" : "translateX(7%)" }}
      >
        <div
          className="animate-vinyl-spin relative h-full w-full rounded-full"
          style={{ animationPlayState: isPlaying ? "running" : "paused" }}
        >
          {/* vinyl body: grooves + light sheen, pure CSS */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `
                conic-gradient(from 200deg, rgba(255,255,255,0.10), transparent 22%, transparent 48%, rgba(255,255,255,0.06) 62%, transparent 80%, rgba(255,255,255,0.10)),
                repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 4px),
                radial-gradient(circle at 50% 50%, #17181d 0%, #0b0c0e 70%, #060607 100%)`,
              boxShadow: "0 10px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)",
            }}
          />
          {/* center label */}
          <div className="absolute left-1/2 top-1/2 aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#EAB308] to-[#a16207] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]">
            <span className="absolute inset-x-0 top-[18%] text-center text-[8px] font-bold uppercase tracking-widest text-black/70">
              Nocturne
            </span>
          </div>
          {/* spindle hole */}
          <div className="absolute left-1/2 top-1/2 size-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#060607] shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_0_0_2px_rgba(255,255,255,0.12)]" />
        </div>
      </div>

      {/* ---- the sleeve: stays on top ---- */}
      <div className="absolute inset-0 z-10 overflow-hidden rounded-xl border border-white/10 bg-[#121419] shadow-2xl">
        {coverUrl ? (
          <img src={coverUrl} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
            <Disc3 className="size-10 text-[#94A3B8]/60" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
          <p dir="auto" className="truncate text-xs font-medium text-[#F2F3F5]">{title}</p>
          <p dir="auto" className="truncate text-[10px] text-[#94A3B8]">{artist}</p>
        </div>
      </div>
    </div>
  );
}
```

**Motion contract (binding).**
- Spin: `vinyl-spin` keyframes, `var(--vinyl-spin-duration)` = `1.8s` (authentic 33⅓ rpm), `linear infinite`.
- Pause behavior: toggle `animation-play-state` only — the disc **freezes mid-rotation**, exactly like
a real record; it never resets to 0°.
- Slide: CSS transition on `translateX` (7% parked → 38% out). Under `prefers-reduced-motion` the
global media query kills the spin; add `motion-reduce:transition-none` on the slider if you want
the slide instant too.
- GPU: rotation is a composited transform — zero layout cost.

**Accessibility & bidi.** `role="img"` with a state-aware label; captions use `dir="auto"`.

---

### Component 4 — `MicroDock` (Micro Dock Floating Sidebar)

**Purpose.** Ultra-thin, detached vertical glass capsule — icon-only floating pill with the smallest
possible desktop footprint. Expands smoothly to reveal labels. Pure-CSS tooltips, glowing amber
active indicator, Lucide icons throughout.

**Props interface.**

```tsx
import type { LucideIcon } from "lucide-react";

export interface DockItem {
  id: string;
  label: string;      // may be Persian — tooltip/label use dir="auto"
  icon: LucideIcon;
  badge?: number;     // Latin digits
}

export interface MicroDockProps {
  items: DockItem[];
  activeId: string;
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}
```

**Implementation** (`src/components/MicroDock.tsx`):

```tsx
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { MicroDockProps } from "./types";
import { cn } from "@/lib/utils";

export function MicroDock({ items, activeId, onSelect, expanded, onToggleExpand }: MicroDockProps) {
  return (
    <nav
      aria-label="Primary"
      role="toolbar"
      aria-orientation="vertical"
      className={cn(
        "flex flex-col items-center gap-1 border border-white/10 bg-[#121419]/90 py-3 shadow-2xl backdrop-blur-xl",
        "transition-[width,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        expanded ? "w-44 rounded-3xl px-2" : "w-14 rounded-full px-0"
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-full outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[#EAB308]",
              expanded ? "w-full px-3" : "w-10 justify-center",
              active ? "text-[#EAB308]" : "text-[#94A3B8] hover:bg-white/10 hover:text-[#F2F3F5]"
            )}
          >
            {/* glowing active indicator dot */}
            {active && (
              <span aria-hidden className="absolute -left-[9px] top-1/2 -translate-y-1/2">
                <span className="block size-1.5 rounded-full bg-[#EAB308] shadow-[0_0_8px_2px_rgba(234,179,8,0.7)]" />
                <span className="absolute inset-0 block size-1.5 animate-[dock-dot-ping_2s_ease-out_infinite] rounded-full bg-[#EAB308]" />
              </span>
            )}

            <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} />

            {expanded ? (
              <span dir="auto" className="truncate text-[13px] font-medium">
                {item.label}
              </span>
            ) : (
              /* pure-CSS tooltip, appears on hover/focus */
              <span
                role="tooltip"
                dir="auto"
                className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-white/10 bg-[#121419] px-2.5 py-1 text-xs text-[#F2F3F5] opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {item.label}
              </span>
            )}

            {typeof item.badge === "number" && item.badge > 0 && (
              <span className="numeric absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#EAB308] text-[9px] font-bold text-black">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </button>
        );
      })}

      {/* expand / collapse */}
      <button
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        className="mt-1 grid size-10 place-items-center rounded-full text-[#94A3B8] outline-none transition-colors hover:bg-white/10 hover:text-[#F2F3F5] focus-visible:ring-2 focus-visible:ring-[#EAB308]"
      >
        {expanded ? <ChevronsLeft className="size-5" /> : <ChevronsRight className="size-5" />}
      </button>
    </nav>
  );
}
```

**Suggested items** (Lucide): `Home` → خانه, `Search` → جست‌وجو, `Library` → کتابخانه,
`Heart` → علاقه‌مندی‌ها, `ListMusic` → پلی‌لیست‌ها, `Settings` → تنظیمات.

**Accessibility & bidi.**
- `role="toolbar"` + `aria-orientation="vertical"`; active item exposes `aria-current="page"`.
- Tooltips are `role="tooltip"`, appear on hover **and** keyboard focus, `dir="auto"` for Persian labels.
- Badges use `.numeric` (Latin digits).
- Amber focus rings everywhere; icon buttons keep a ≥40px hit area.

---

### Component 5 — `StageView` (Cinematic Split Stage View)

**Purpose.** Split dashboard: the active track's artwork owns 50% of the stage with high-res glow;
the other 50% shows the live up-next queue and a lyrics preview. Glass backing, ambient blur tinted
by the track's dominant color.

**Props interface.**

```tsx
export interface StageViewProps {
  track: Track;
  queue: Track[];
  queueOffset: number;      // index of `track` inside `queue`
  isPlaying: boolean;
  onSelectQueued: (queueIndex: number) => void;
  lyrics?: string[];        // plain lines; line-by-line sync is integrator's job
  activeLyric?: number;
}
```

**Implementation** (`src/components/StageView.tsx`):

```tsx
import { ListMusic, MicVocal } from "lucide-react";
import { formatTime, type StageViewProps, type Track } from "@/types/player";
import { AmbientGlow } from "./AmbientGlow";
import { cn } from "@/lib/utils";

function QueueRow({ track, index, active, onPick }: {
  track: Track; index: number; active: boolean; onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-[#EAB308]",
        active ? "bg-[#EAB308]/10" : "hover:bg-white/5"
      )}
    >
      <span className={cn("numeric w-6 shrink-0 text-xs", active ? "text-[#EAB308]" : "text-[#94A3B8]")}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className={cn("block truncate text-[13px]", active ? "text-[#EAB308]" : "text-[#F2F3F5]")}>
          {track.title}
        </span>
        <span dir="auto" className="block truncate text-[11px] text-[#94A3B8]">{track.artist}</span>
      </span>
      <span className="numeric shrink-0 text-[11px] text-[#94A3B8]">{formatTime(track.duration)}</span>
    </button>
  );
}

export function StageView({ track, queue, queueOffset, isPlaying, onSelectQueued, lyrics, activeLyric }: StageViewProps) {
  const accent = track.color ?? "#EAB308";
  const upcoming = queue.slice(queueOffset + 1, queueOffset + 8);

  return (
    <section aria-label="Now playing stage" className="grid h-full grid-cols-2 gap-5" dir="ltr">
      {/* ---- 50%: artwork stage ---- */}
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[#121419]/70 p-8 backdrop-blur-xl">
        <AmbientGlow color={accent} pulsing={isPlaying} intensity={0.5} className="inset-0" />
        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
            {track.coverUrl ? (
              <img src={track.coverUrl} alt="" draggable={false} className="aspect-square w-64 object-cover" />
            ) : (
              <div className="grid aspect-square w-64 place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]">
                <MicVocal className="size-16 text-[#94A3B8]/50" />
              </div>
            )}
          </div>
          {/* reflection */}
          <div aria-hidden className="mt-1 aspect-[16/4] w-64 overflow-hidden rounded-b-2xl opacity-25 [transform:scaleY(-1)] [mask-image:linear-gradient(to_top,black,transparent)]">
            {track.coverUrl && <img src={track.coverUrl} alt="" draggable={false} className="h-full w-full object-cover" />}
          </div>
        </div>
        <h2 dir="auto" className="relative mt-5 max-w-full truncate text-2xl font-semibold text-[#F2F3F5]">{track.title}</h2>
        <p dir="auto" className="relative mt-1 truncate text-sm text-[#94A3B8]">{track.artist}</p>
      </div>

      {/* ---- 50%: queue + lyrics ---- */}
      <div className="flex min-h-0 flex-col gap-5">
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-white/10 bg-[#121419]/70 p-4 backdrop-blur-xl">
          <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">
            <ListMusic className="size-4" /> Up next
          </h3>
          <div className="nocturne-scroll min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Upcoming queue">
            {upcoming.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[#94A3B8]">Queue is empty — the stage is yours.</p>
            ) : (
              upcoming.map((t, k) => (
                <div role="listitem" key={t.id}>
                  <QueueRow track={t} index={queueOffset + 1 + k} active={false}
                    onPick={() => onSelectQueued(queueOffset + 1 + k)} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#121419]/70 p-4 backdrop-blur-xl">
          <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">
            <MicVocal className="size-4" /> Lyrics preview
          </h3>
          <div className="nocturne-scroll max-h-28 overflow-y-auto px-1" aria-live="off">
            {!lyrics || lyrics.length === 0 ? (
              <p className="py-3 text-center text-sm text-[#94A3B8]">No lyrics for this track.</p>
            ) : (
              lyrics.slice(0, 6).map((line, i) => (
                <p key={i} dir="auto"
                  className={cn("truncate py-0.5 text-[13px]",
                    i === 0 ? "font-medium text-[#EAB308]" : "text-[#94A3B8]")}>
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Accessibility & bidi.**
- Section labelled; queue is `role="list"`/`listitem`; rows expose `aria-current`.
- Track titles/artists/lyrics all `dir="auto"`; counters and durations `.numeric` LTR.
- Thin custom scrollbars (`.nocturne-scroll`) so panes never show the native Windows scrollbar.

---

### Component 6 — `AmbientGlow` (Ambient Ember Aura)

**Purpose.** Organic, breathing ambient light behind active cards and capsules — the "floating in
space" feeling. A single GPU-composited radial-gradient layer: `will-change-transform`, blurred,
pulsing gently with playback state. Costs one composited layer; zero layout/CPU work per frame.

**Props interface.**

```tsx
export interface AmbientGlowProps {
  /** Any CSS color. Default "#EAB308". */
  color?: string;
  /** 0..1 master opacity. Default 0.55. */
  intensity?: number;
  /** True while audio is playing — pauses the breathing when false. */
  pulsing?: boolean;
  className?: string;
}
```

**Implementation** (`src/components/AmbientGlow.tsx`):

```tsx
import type { AmbientGlowProps } from "./types";
import { cn } from "@/lib/utils";

/** Append alpha to a #rrggbb color. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

export function AmbientGlow({ color = "#EAB308", intensity = 0.55, pulsing = true, className }: AmbientGlowProps) {
  return (
    <div
      aria-hidden
      className={cn("aura-pulse pointer-events-none absolute", className)}
      style={{
        background: `radial-gradient(closest-side, ${withAlpha(color, 0.55)}, ${withAlpha(color, 0.12)} 55%, transparent 75%)`,
        filter: "blur(56px)",
        willChange: "transform, opacity",
        opacity: intensity,
        animationPlayState: pulsing ? "running" : "paused",
      }}
    />
  );
}
```

**Usage notes.**
- Always `aria-hidden` + `pointer-events-none` — pure atmosphere, never interactive.
- Tint per track: `<AmbientGlow color={track.color ?? "#EAB308"} pulsing={isPlaying} />`.
- Keep at most 2–3 live instances per screen; each is one GPU layer.
- Under `prefers-reduced-motion` the global media query freezes the pulse automatically.

---

## 4. Integration Guide

### 4.1 Player state — `src/stores/usePlayerStore.ts` (Zustand)

All six components are **presentational**: they read from this store and call its actions.
Audio itself is one singleton `HTMLAudioElement` owned by the store — components never touch audio
directly, so the frameless UI can never break playback.

```ts
import { create } from "zustand";
import type { Track } from "@/types/player";

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  peaks: number[];               // decoded once per track, cached in SQLite
  // actions
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (ratio: number) => void; // 0..1
  playTrackAt: (index: number) => void;
  setVolume: (v: number) => void;
}

const audio = new Audio();
audio.preload = "metadata";

export const usePlayerStore = create<PlayerState>((set, get) => {
  audio.ontimeupdate = () => set({ currentTime: audio.currentTime });
  audio.onloadedmetadata = () => set({ duration: audio.duration || 0 });
  audio.onended = () => get().next();

  return {
    queue: [], currentIndex: 0, isPlaying: false,
    currentTime: 0, duration: 0, volume: 0.8, peaks: [],

    toggle: () => {
      const { isPlaying } = get();
      if (isPlaying) { audio.pause(); set({ isPlaying: false }); }
      else { void audio.play(); set({ isPlaying: true }); }
    },
    next: () => {
      const { queue, currentIndex } = get();
      if (queue.length === 0) return;
      get().playTrackAt((currentIndex + 1) % queue.length);
    },
    prev: () => {
      const { queue, currentIndex } = get();
      if (queue.length === 0) return;
      get().playTrackAt((currentIndex - 1 + queue.length) % queue.length);
    },
    seek: (ratio) => {
      if (audio.duration) {
        audio.currentTime = ratio * audio.duration;
        set({ currentTime: audio.currentTime });
      }
    },
    playTrackAt: (index) => {
      const track = get().queue[index];
      if (!track) return;
      // resolve local file URL via Tauri (convertFileSrc) in the real app
      audio.src = track.id; // placeholder — wire to your Tauri file resolver
      set({ currentIndex: index, currentTime: 0, peaks: [] });
      void audio.play();
      set({ isPlaying: true });
      // TODO: load peaks for track.id from SQLite; decode on first play
    },
    setVolume: (v) => { audio.volume = v; set({ volume: v }); },
  };
});
```

### 4.2 `App.tsx` — floating islands over the transparent canvas

```tsx
import { useState } from "react";
import { Home, Search, Library, Heart, ListMusic, Settings } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { MicroDock } from "@/components/MicroDock";
import { StageView } from "@/components/StageView";
import { PlayerBar } from "@/components/PlayerBar";

const DOCK_ITEMS = [
  { id: "home", label: "خانه", icon: Home },
  { id: "search", label: "جست‌وجو", icon: Search },
  { id: "library", label: "کتابخانه", icon: Library },
  { id: "favorites", label: "علاقه‌مندی‌ها", icon: Heart },
  { id: "playlists", label: "پلی‌لیست‌ها", icon: ListMusic },
  { id: "settings", label: "تنظیمات", icon: Settings },
];

export default function App() {
  const [dockExpanded, setDockExpanded] = useState(false);
  const [activeNav, setActiveNav] = useState("home");
  const { queue, currentIndex, isPlaying } = usePlayerStore();
  const track = queue[currentIndex];

  return (
    /* Root: NO background — the window stays transparent passthrough. */
    <div className="flex h-screen w-screen gap-4 overflow-hidden p-4 text-[#F2F3F5]">
      {/* drag strip: lets users move the frameless window by island headers */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-8" aria-hidden />

      <MicroDock
        items={DOCK_ITEMS}
        activeId={activeNav}
        onSelect={setActiveNav}
        expanded={dockExpanded}
        onToggleExpand={() => setDockExpanded((v) => !v)}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1">
          {track ? (
            <StageView
              track={track}
              queue={queue}
              queueOffset={currentIndex}
              isPlaying={isPlaying}
              onSelectQueued={(i) => usePlayerStore.getState().playTrackAt(i)}
            />
          ) : (
            /* empty library state */
            <div className="grid h-full place-items-center rounded-3xl border border-white/10 bg-[#121419]/70 backdrop-blur-xl">
              <p className="text-[#94A3B8]">Add a music folder to begin.</p>
            </div>
          )}
        </div>

        {/* floating capsule player bar */}
        {track && (
          <div className="rounded-3xl border border-white/10 bg-[#121419]/90 shadow-2xl backdrop-blur-xl">
            <PlayerBar />
          </div>
        )}
      </main>
    </div>
  );
}
```

### 4.3 `PlayerBar.tsx` — WaveformSeeker + transport + VinylOrbit

```tsx
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { formatTime } from "@/types/player";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { WaveformSeeker } from "./WaveformSeeker";
import { VinylOrbit } from "./VinylOrbit";

function TransportButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="grid size-10 place-items-center rounded-full text-[#94A3B8] outline-none transition-colors hover:bg-white/10 hover:text-[#F2F3F5] focus-visible:ring-2 focus-visible:ring-[#EAB308] disabled:opacity-40"
    />
  );
}

export function PlayerBar() {
  const { queue, currentIndex, isPlaying, currentTime, duration, peaks, toggle, next, prev, seek } =
    usePlayerStore();
  const track = queue[currentIndex];
  if (!track) return null;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-4 px-5 py-3" dir="ltr">
      <VinylOrbit
        isPlaying={isPlaying}
        coverUrl={track.coverUrl}
        title={track.title}
        artist={track.artist}
        size={64}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm">
            <span dir="auto" className="font-medium text-[#F2F3F5]">{track.title}</span>
            <span dir="auto" className="text-[#94A3B8]"> — {track.artist}</span>
          </p>
          <p className="numeric shrink-0 text-xs text-[#94A3B8]">
            {formatTime(currentTime)} <span className="opacity-60">/ {formatTime(duration)}</span>
          </p>
        </div>
        <WaveformSeeker
          peaks={peaks}
          progress={progress}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onSeek={seek}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1" role="toolbar" aria-label="Playback controls">
        <TransportButton aria-label="Shuffle"><Shuffle className="size-4" /></TransportButton>
        <TransportButton aria-label="Previous track" onClick={prev}><SkipBack className="size-5" /></TransportButton>
        <button
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
          aria-pressed={isPlaying}
          className="grid size-12 place-items-center rounded-full bg-[#EAB308] text-black shadow-[0_0_24px_rgba(234,179,8,0.45)] outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#F2F3F5] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121419]"
        >
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 translate-x-[1px]" />}
        </button>
        <TransportButton aria-label="Next track" onClick={next}><SkipForward className="size-5" /></TransportButton>
        <TransportButton aria-label="Repeat"><Repeat className="size-4" /></TransportButton>
      </div>
    </div>
  );
}
```

### 4.4 Tauri frameless-window checklist (do not skip)

1. `src-tauri/tauri.conf.json` → `app.windows[0]`: `"decorations": false, "transparent": true`.
   (Shadows: Tauri v2 draws no native shadow on transparent windows — the islands' own
   `shadow-2xl` utilities are the depth system. Do not fight it.)
2. **Never** set an opaque background on `html`, `body`, `#root`, or the App root div —
   one opaque layer kills the passthrough for the whole window. Islands (`bg-[#121419]`,
   with or without `/70` alpha) are the only surfaces.
3. Dragging: put `data-tauri-drag-region` on non-interactive island headers (see `App.tsx`
   drag strip). Keep transport buttons, seeker, and dock **outside** drag regions so clicks
   are never swallowed.
4. `backdrop-blur-xl` over a transparent Tauri window blurs the live Windows desktop behind
   the island — that's the signature glass effect. Verify on Windows 11 (DWM); on
   Windows 10 fall back to solid `bg-[#121419]` (no alpha) if blur is unsupported.
5. Audio keeps playing independently: the singleton `HTMLAudioElement` lives in the Zustand
   store module, not in any component — unmounting/re-mounting UI (view switches,
   CoverFlow dismiss) can never interrupt playback.

### 4.5 Bidi & accessibility acceptance checklist

- [ ] All song/artist/album/lyric strings render with `dir="auto"`.
- [ ] All durations, counters, timestamps, badges use `.numeric` (Latin digits, `dir="ltr"`, tabular nums).
- [ ] Layout stays LTR; MicroDock on the left; tooltips open to the right.
- [ ] Every interactive element reachable by keyboard with a visible amber focus ring.
- [ ] `prefers-reduced-motion`: vinyl frozen, aura still, waveform shimmer off (covered by the global media query).
- [ ] CoverFlow: arrows + Escape; Seeker: arrows/Home/End with `role="slider"` semantics.
- [ ] No layout shift when covers are missing (placeholder blocks keep aspect).

---

## 5. File map (what OpenCode should create)

```
src/
  types/player.ts            # Track, formatTime (+ re-exported prop interfaces)
  components/
    types.ts                 # the 6 Props interfaces (or colocate per file)
    CoverFlowView.tsx
    WaveformSeeker.tsx
    VinylOrbit.tsx
    MicroDock.tsx
    StageView.tsx
    AmbientGlow.tsx
    PlayerBar.tsx
  stores/
    usePlayerStore.ts        # Zustand + singleton HTMLAudioElement
  index.css                  # tokens, keyframes, .numeric, scrollbars, reduced-motion
  App.tsx                    # island composition + drag region
```

*End of specification.*
