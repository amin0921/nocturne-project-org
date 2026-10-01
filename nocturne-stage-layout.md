# NOCTURNE — 3-Island Cinematic Stage Layout

**Companion to:** `nocturne-ui-spec.md` (component blueprints: MicroDock, WaveformSeeker, VinylOrbit,
AmbientGlow, PlayerBar, Zustand player store).
**This document** specifies the *layout architecture*: how the four floating pieces sit on the
transparent canvas, how state flows between them without jitter, and how the user toggles between
the cinematic stage and the traditional library table.

## 1. Layout vision

```
┌──────────────────────────────────────────────────────────────┐
│  transparent passthrough (the Windows desktop shows through) │
│                                                              │
│   ┌─────┐   ┌───────────────────────┐   ┌─────────────────┐   │
│   │     │   │   CENTER ISLAND       │   │  RIGHT ISLAND   │   │
│   │ DOCK│   │   cinematic stage:    │   │  queue panel:   │   │
│   │     │   │   artwork + aura +    │   │  now playing +  │   │
│   │     │   │   info + lyrics       │   │  up-next list   │   │
│   │     │   │                       │   │  (click=play)   │   │
│   │     │   └───────────────────────┘   └─────────────────┘   │
│   │     │   ┌───────────────────────────────────────────┐   │
│   │     │   │ BOTTOM CAPSULE: vinyl + waveform + controls│   │
│   └─────┘   └───────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Four floating pieces, one transparent canvas:
1. **Dock island** (far left) — `MicroDock`, ultra-thin icon pill, vertically centered.
2. **Center island** — cinematic stage (artwork, `AmbientGlow`, track info, lyrics preview)
   *or* the full library table (toggleable, same island shell).
3. **Right island** — detached glass queue panel: now-playing header + clickable up-next list.
4. **Bottom capsule** — `PlayerBar` (VinylOrbit + WaveformSeeker + transport), spanning center+right.

The gaps *between* islands are deliberate negative space — the desktop shows through. No island
may paint outside its own rounded box.

## 2. Grid geometry

### 2.1 Why plain CSS, not Tailwind arbitrary values

`grid-template-areas` needs quoted multi-line strings — painful and unreadable as Tailwind
arbitrary properties. One small, explicit CSS block is the production-correct choice here;
islands still use Tailwind for everything else.

Append to `src/index.css`:

```css
/* ---------- Nocturne 3-island shell ---------- */
.nocturne-shell {
  display: grid;
  height: 100vh;
  width: 100vw;
  gap: 1rem;            /* the negative space between islands */
  padding: 1rem;        /* the negative space at the window edge */
  grid-template-columns: auto minmax(0, 1fr) 320px;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    "dock stage queue"
    "dock player player";
}

.island-dock   { grid-area: dock; align-self: center; }  /* floating pill, vertically centered */
.island-stage  { grid-area: stage; min-width: 0; min-height: 0; }
.island-queue  { grid-area: queue; min-width: 0; min-height: 0; }
.island-player { grid-area: player; min-width: 0; }

/* Every island is a glass surface; the shell itself is never painted. */
.island {
  border-radius: 1.5rem;               /* rounded-3xl */
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(18, 20, 25, 0.82); /* #121419 at 82% — glass over the live desktop */
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.55);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

### 2.2 Breakpoints — zero-lag responsiveness

```css
/* Large desktop: queue slims down */
@media (max-width: 1279px) {
  .nocturne-shell { grid-template-columns: auto minmax(0, 1fr) 280px; }
}

/* < 1024px: the right island leaves the grid and becomes a slide-over panel.
   Grid collapses to 2 columns; no reflow of dock/stage/player. */
@media (max-width: 1023px) {
  .nocturne-shell {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "dock stage"
      "dock player";
  }
  .island-queue { display: none; }
}

.queue-sheet {
  position: fixed;
  top: 1rem; right: 1rem; bottom: 1rem;
  width: min(320px, 85vw);
  z-index: 40;
  transform: translateX(calc(100% + 1rem));
  transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}
.queue-sheet.open { transform: none; }
```

Rules that keep it fast:
- **`minmax(0, 1fr)` + `min-w-0`/`min-h-0` on every grid child.** This is the #1 rule: without it,
  long track titles or artwork force columns wider than the viewport ("grid blowout") and the
  whole layout janks on resize.
- **Never animate grid properties** (`grid-template-columns` etc. are not GPU-composited).
  Animate only `transform` and `opacity` (queue sheet slide, content crossfades).
- **Fixed row for the player** (`auto`): the capsule sizes to its content once; track changes
  never resize it.
- **Queue list is light DOM** (`overflow-y-auto` + `.nocturne-scroll` thin scrollbars). If a
  queue ever exceeds ~200 rows, virtualize (optional future: `@tanstack/virtual` — 3 kB).

### 2.3 `App.tsx` — the shell

```tsx
import { useEffect } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useUIStore } from "@/stores/useUIStore";
import { MicroDock } from "@/components/MicroDock";
import { CenterIsland } from "@/components/CenterIsland";
import { QueuePanel } from "@/components/QueuePanel";
import { PlayerBar } from "@/components/PlayerBar";
import { DOCK_ITEMS } from "@/config/dock";

export default function App() {
  const setView = useUIStore((s) => s.setView);

  /* Quick toggle shortcut: Ctrl+1 = stage, Ctrl+2 = library */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "1") setView("stage");
      if (e.ctrlKey && e.key === "2") setView("library");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  return (
    <div className="nocturne-shell text-[#F2F3F5]">
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-8" aria-hidden />

      <div className="island-dock">
        <MicroDock /* ...props as specified in nocturne-ui-spec.md */ />
      </div>

      <section className="island island-stage" aria-label="Main view">
        <CenterIsland />
      </section>

      <aside className="island island-queue" aria-label="Play queue">
        <QueuePanel />
      </aside>

      <footer className="island island-player" aria-label="Player controls">
        <PlayerBar />
      </footer>

      {/* < lg: queue becomes a slide-over sheet */}
      <QueueSheet />
    </div>
  );
}
```

> `QueueSheet` reuses `QueuePanel` inside the `.queue-sheet` fixed container, opened via
> `useUIStore(s => s.queueOpen)` and a "Up next" (`ListMusic`) button in `PlayerBar`.

---

## 3. State orchestration — queue click → stage update with zero jitter

### 3.1 The core principle

**The layout never moves; only the content crossfades.** The grid areas, island shells, artwork
box, and text slots all have fixed geometry. A queue click changes *data* (one synchronous Zustand
`set`), and React swaps the stage's inner content with a GPU-only enter animation keyed by
`track.id`.

### 3.2 Data flow (single atomic commit)

```
QueuePanel row click
  → usePlayerStore.playTrackAt(index)      // one set(): currentIndex, currentTime, peaks, audio.src, audio.play()
    → QueuePanel re-renders (new highlight) ─┐
    → CenterIsland re-renders (new artwork) ─┼─ same React commit, same frame
    → PlayerBar re-renders (new title) ──────┘
```

`playTrackAt` already exists in `nocturne-ui-spec.md` §4.1. Add one guard so clicking the
currently-playing row is a no-op (no restart, no flicker):

```ts
playTrackAt: (index) => {
  if (index === get().currentIndex) return;   // ← no-op guard
  /* ...rest unchanged */
},
```

`QueuePanel` calls it directly — no prop drilling, no intermediate local state, no lag:

```tsx
export function QueuePanel() {
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const playTrackAt = usePlayerStore((s) => s.playTrackAt);

  usePreloadCovers(queue.slice(currentIndex + 1, currentIndex + 5)); // §3.4

  const upcoming = queue.slice(currentIndex); // includes now-playing at [0]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Up next" count={upcoming.length - 1} />
      <div className="nocturne-scroll min-h-0 flex-1 overflow-y-auto p-2" role="list" aria-label="Upcoming tracks">
        {upcoming.map((t, k) => {
          const qi = currentIndex + k;
          const active = k === 0;
          return (
            <button key={t.id} role="listitem" onClick={() => playTrackAt(qi)}
              aria-current={active || undefined}
              className={/* row styles; active → amber tint + EqBars; see §3.3 */}>
              <span className="numeric">{String(qi + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate">{t.title}</span>
                <span dir="auto" className="block truncate text-[#94A3B8]">{t.artist}</span>
              </span>
              <span className="numeric">{formatTime(t.duration)}</span>
              {active && <EqBars />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### 3.3 The jitter-free stage swap

`CenterIsland` (replaces the old 50/50 `StageView` — the queue has moved to its own island):

```tsx
export function CenterIsland() {
  const view = useUIStore((s) => s.view);
  const track = usePlayerStore((s) => s.queue[s.currentIndex]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  return (
    <>
      <IslandHeader
        title={view === "stage" ? "Now playing" : "Library"}
        right={<ViewToggle />}
      />
      {view === "stage" ? (
        /* KEYED by track.id: React treats each track as new content → enter animation.
           The island shell, artwork box and text slots never resize → no jitter. */
        <div key={track?.id ?? "empty"} className="stage-enter flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
          <div className="relative">
            <AmbientGlow color={track?.color ?? "#EAB308"} pulsing={isPlaying} intensity={0.5} className="inset-[-40px]" />
            <div className="relative aspect-square w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/10">
              {track?.coverUrl
                ? <img src={track.coverUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#1b1e26] to-[#121419]"><Disc3 /></div>}
            </div>
          </div>
          {/* fixed single-line slots: title/artist can never push layout around */}
          <h2 dir="auto" className="max-w-full truncate text-2xl font-semibold text-[#F2F3F5]">{track?.title}</h2>
          <p dir="auto" className="-mt-3 max-w-full truncate text-sm text-[#94A3B8]">{track?.artist}</p>
          <LyricsPreview />
        </div>
      ) : (
        <LibraryTable />
      )}
    </>
  );
}
```

```css
/* index.css — GPU-only enter animation (transform + opacity, never layout) */
@keyframes stage-enter {
  from { opacity: 0; transform: translateY(14px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
.stage-enter { animation: stage-enter 340ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .stage-enter { animation: none; } }
```

Anti-jitter checklist (binding):
- [ ] Artwork box is `aspect-square` with a `max-w` — the box exists before the image loads;
  the `<img>` is absolutely positioned inside it. Image load can never reflow text below.
- [ ] Title/artist are single-line `truncate` slots with fixed line-height — long Persian titles
  clip instead of wrapping and pushing the lyrics pane.
- [ ] Lyrics pane has a fixed `max-h` + internal scroll — lyric length never changes island height.
- [ ] Only `transform`/`opacity` are animated. No `height`, `margin`, or grid animation anywhere.
- [ ] One atomic Zustand `set` per track change → all islands commit in the same frame.
- [ ] No-op guard on clicking the active row.

### 3.4 Cover preloading (no flash-of-placeholder)

```ts
/** Warm the browser cache for the next few covers so the stage swap never flashes. */
export function usePreloadCovers(tracks: Track[]) {
  useEffect(() => {
    tracks.forEach((t) => {
      if (t.coverUrl) { const img = new Image(); img.src = t.coverUrl; }
    });
  }, [tracks]);
}
```

Call it in `QueuePanel` with the next ~4 upcoming tracks. (Covers are local files via Tauri's
`convertFileSrc`; preloading still applies.)

---

## 4. Quick toggle — Cinematic Stage ⇄ Full Library Table

### 4.1 State — `src/stores/useUIStore.ts`

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "stage" | "library";

interface UIState {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  queueOpen: boolean;              // <lg slide-over sheet
  setQueueOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: "stage",
      setView: (view) => set({ view }),
      queueOpen: false,
      setQueueOpen: (queueOpen) => set({ queueOpen }),
    }),
    { name: "nocturne-ui", partialize: (s) => ({ view: s.view }) }
  )
);
```

The choice persists across restarts — the app reopens in the user's preferred view.

### 4.2 The toggle control — `ViewToggle.tsx`

A segmented control pinned to the center island's header (always visible, both modes):

```tsx
import { LayoutDashboard, Table2 } from "lucide-react";
import { useUIStore, type ViewMode } from "@/stores/useUIStore";
import { cn } from "@/lib/utils";

const OPTIONS: { id: ViewMode; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: "stage", label: "Stage", icon: LayoutDashboard, hint: "Cinematic stage view (Ctrl+1)" },
  { id: "library", label: "Library", icon: Table2, hint: "Full library table (Ctrl+2)" },
];

export function ViewToggle() {
  const view = useUIStore((s) => s.view);
  const setView = useUIStore((s) => s.setView);
  return (
    <div role="group" aria-label="Switch main view"
      className="flex rounded-full border border-white/10 bg-black/30 p-1">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = view === o.id;
        return (
          <button key={o.id} onClick={() => setView(o.id)}
            aria-pressed={active} title={o.hint}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium outline-none transition-all",
              "focus-visible:ring-2 focus-visible:ring-[#EAB308]",
              active ? "bg-[#EAB308] text-black shadow-[0_0_16px_rgba(234,179,8,0.4)]"
                     : "text-[#94A3B8] hover:text-[#F2F3F5]"
            )}>
            <Icon className="size-3.5" />{o.label}
          </button>
        );
      })}
    </div>
  );
}
```

### 4.3 The library view — `LibraryTable.tsx`

Reuses the **data-table pattern** already collected (`vibefarsi-ui-components.md`: `data-table` ←
`table`, `pagination`, `input`, `empty-state`). Columns:

| # (numeric) | Title (dir="auto", cover thumb 32px) | Artist (dir="auto") | Album (dir="auto") | Duration (numeric) | ⋯ (row context menu) |

Behavior contract:
- Row click (or Enter) → `playTrackAt(rowIndex)` — the *same* action the queue uses, so the
  center stage updates identically from either view.
- Current-track row: `aria-current="true"`, amber title, `EqBars` mini equalizer, subtle
  `bg-[#EAB308]/5` wash.
- Search input in the island header (library mode only) filters client-side; SQLite FTS is a
  future optimization.
- The queue island and player capsule **stay mounted and live** in library mode — only the
  center island's content swaps, so toggling never reflows the rest of the layout.

```tsx
/** 3-bar mini equalizer for the now-playing row. Pure CSS, GPU-only. */
export function EqBars({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-3.5 items-end gap-[2px]", className)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="waveform-idle-bar w-[3px] rounded-full bg-[#EAB308]"
          style={{ height: "100%", animationDelay: `${i * 0.18}s`, animationDuration: "0.9s" }} />
      ))}
    </span>
  );
}
```

(`waveform-idle-bar` keyframes already defined in `nocturne-ui-spec.md` §2; pause it when
`!isPlaying` via `animation-play-state`, same as the vinyl.)

### 4.4 What does NOT change on toggle

- Grid areas, island shells, gaps — identical. The toggle swaps *inner content* of the center
  island only.
- `usePlayerStore` is untouched; playback continues seamlessly across toggles.
- The queue panel keeps working in both views (it's the play queue, not the library).

---

## 5. File map (extends `nocturne-ui-spec.md` §5)

```
src/
  index.css                  # += .nocturne-shell, .island, .queue-sheet, stage-enter
  components/
    CenterIsland.tsx         # island shell: header (title + ViewToggle) + stage/library swap
    ViewToggle.tsx           # segmented Stage ⇄ Library control
    LibraryTable.tsx         # data-table columns, search, current-row EqBars
    QueuePanel.tsx           # right island: now-playing + clickable up-next
    QueueSheet.tsx           # <lg slide-over wrapper around QueuePanel
    EqBars.tsx               # mini equalizer indicator
  stores/
    useUIStore.ts            # view + queueOpen, persisted
  config/dock.ts             # DOCK_ITEMS (labels can be Persian; icons Lucide)
```

## 6. Acceptance checklist

- [ ] 16px gutters between all islands show the live desktop (passthrough verified on Win 11).
- [ ] Resizing the window never reflows text or jumps islands (`minmax(0,1fr)` + `min-w-0`/`min-h-0`).
- [ ] Queue click → stage crossfades in ~340ms; artwork box never changes size; no text shift.
- [ ] Clicking the active queue row does nothing (no restart).
- [ ] <1024px: queue becomes a slide-over sheet; stage + player keep their grid cells.
- [ ] Toggle Stage ⇄ Library via header control *and* Ctrl+1/Ctrl+2; choice persists after restart.
- [ ] Library row click plays the track and updates the stage identically to a queue click.
- [ ] `prefers-reduced-motion`: no crossfade, no vinyl spin, no aura pulse, no EQ dance.

*End of layout specification.*
