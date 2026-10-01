# Nocturne — Performance Audit Report (AUDIT ONLY, NO CODE CHANGES)

> Scope: `nocturne-tauri/` active Tauri v2 app only. Root Electron `src/`, `out/` treated as frozen legacy per `AGENTS.md` and not audited for runtime cost.
> Method: static source inspection only. No profiler attached, no code modified. All claims cite `file:line`.
> Symptom under audit: DWM ~0.5% CPU while two WebView2 renderers sit at ~26.0% and ~17.9%. This report therefore **deprioritizes OS alpha/DWM hypotheses** and hunts in-page causes: timers, store fan-out, rAF loops, continuous CSS paint.

---

## 1. Actual Frontend Architecture & State Mechanism

### 1.1 Declared vs. actual stack

| Layer | `AGENTS.md` claim | Ground truth in `nocturne-tauri/package.json:12-19` |
|---|---|---|
| Shell | Tauri v2 + Rust | Confirmed: `src-tauri/tauri.conf.json:1-67`, `src-tauri/Cargo.toml:12-18` (`tauri v2`, `protocol-asset`, `rusqlite bundled`, `lofty 0.22`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`) |
| Frontend | Vite + React 18 + TS + Tailwind 3.4 + **Zustand** | Partially false: `react 18.3.1`, `react-dom 18.3.1`, `vite 5.4.10`, `tailwindcss 3.4.14`, `@tauri-apps/api 2.2.0`, `clsx`, `tailwind-merge`, `lucide-react 1.47` — **no `zustand`, no `@reduxjs`, no `jotai` in `dependencies` or `devDependencies`**. Verified by full read of `nocturne-tauri/package.json:1-31`. |
| DB | Local SQLite via Rust | Confirmed: `src-tauri/src/db.rs`, `main.rs:147-153` (`open_db`), commands `get_tracks`, `record_play`, `get_lyric_offset`, etc. |
| Audio | `HTMLAudioElement` only | Confirmed: `src/services/audio-controller.ts:1-81` — single `new Audio()`, `preload='auto'`, no Web Audio, no `createMediaElementSource` (explicitly removed per comment at `:4-6`). |

**Conclusion: there is no Zustand store.** State is five hand-rolled `useSyncExternalStore` external stores plus two hooks:

- `src/stores/usePlayerStore.ts:60-153` — canonical playback snapshot (`queue`, `priorityQueue`, `index`, `currentTrack`, `isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`, `mode`, `favorites`, `currentLyrics`). Custom `set()` at `:137-141`, custom `subscribe()` at `:143-148`, selector hook at `:151-153`.
- `src/stores/useUIStore.ts:39-129` — `view`, `queueOpen`, `rightTab`, `lyricsOpen`, `cinemaOpen` + actions. Same hand-rolled pattern.
- `src/stores/useMiniPlayerStore.ts:12-74` — read-only mirror (`isPlaying`, `currentTime`, `duration`, `track`) fed by `BroadcastChannel`. Never touches audio by contract (`:8-10`).
- `src/stores/useLyricOffset.ts:1-109` — per-track `offsetMs` map backed by SQLite (`get_lyric_offset` / `set_lyric_offset` invokes).
- `src/stores/useAmbientPalette.ts:14-42` — derives palette from `currentTrack.coverUrl` via cached canvas extractor (`utils/colorExtractor.ts`).
- `src/components/queue/usePlaybackHistory.ts`, `src/components/queue/useQueueUndo.ts` — history + undo snapshots (accessed via `usePlayerStore.getState().push` at `usePlayerStore.ts:404`, i.e. a Zustand-style `getState` shim bolted onto the hand-rolled store at `:806-830`).

`src/main.tsx:1-32` demuxes windows by label (`main` → `App`, `mini-island` → `MiniIslandApp` via `lazy()`), explicitly to avoid a second `HTMLAudioElement` in the mini window (`:6-9` comment).

### 1.2 The central perf-relevant mechanism: `set()` fans out to everything, at audio-clock rate

`usePlayerStore.ts:137-141`:

```ts
function set(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());   // every usePlayerStore subscriber re-runs its selector
  broadcastState();                 // every set() also postMessages the mini window
}
```

`broadcastState()` (`:114-135`) builds a `STATE_UPDATE` and `postMessage`s it on `BroadcastChannel('nocturne-player')` (`services/player-broadcast.ts:7-50`) — **on every `set()`, including the ~4 Hz `currentTime` tick**:

`services/audio-controller.ts:18-21` → native `timeupdate` (~4 Hz) → `usePlayerStore.ts:478-481`:

```ts
audioController.onTime(() => {
  set({ currentTime: audioController.getTime() });
  updatePlayTrackingTime(snapshot.isPlaying);
});
```

Subscribers that re-evaluate on each tick (all in the main window):

- `PlayerBar.tsx:34-37` (`currentTrack`, `isPlaying`, `currentTime`, `duration`, `mode`) → recomputes `progress` at `:47`, re-renders `WaveformSeeker` with new `progress/currentTime`.
- `WaveformSeeker.tsx:64` (`currentLyrics`), plus `progress/currentTime/duration` props — re-renders **72 SVG `<rect>`** (`:260-280`) with new `fill`/`opacity` per bar per tick, moves the `<line>` playhead (`:282-291`), and carries a `<style>` rule applying `filter: drop-shadow(...)` to every played bar (`:296-300`).
- `LyricsPane.tsx:92-94` (`currentTrack`, `currentTime`, `isPlaying`, `currentLyrics`) → `activeIndex` linear scan (`:229-242`) per tick + `centerActiveLine()` → `scrollIntoView({behavior:'smooth'})` (`:270-290,356-360`).
- `DynamicIslandLyrics.tsx:65-66` (`currentTrack`, `isPlaying`), `CenterIsland.tsx:37-38`, `QueuePanel.tsx:91-95`.
- Cross-window: **every tick wakes the hidden mini-island renderer** via `BroadcastChannel`, where `useMiniPlayerStore.ts:52-56` `set(msg.payload)` re-renders `MiniIslandCard.tsx:94-97` (`isPlaying`, `currentTime`, `duration`, `track`) → new `progressPct` width style (`:207-208`), time text (`:367-382`).

There is no selector memoization, no tick coalescing, no `requestAnimationFrame` batching of the 4 Hz clock. When playing, the whole seek/lyrics/mini pipeline invalidates 4×/s by design. When paused, `timeupdate` stops, so this path goes quiet — the **idle-paused** cost must come from elsewhere (Section 3).

### 1.3 Backend owns disk & DB — respected, with one scope-drift flag

All file/DB access goes through `invoke()` allowlist (`get_tracks`, `scan_folder`, `import_audio_files`, `ingest_paths`, `get_lyrics`, `record_play`, etc. — `App.tsx:251,522,569,603`, `main.rs:161-180`). No raw fs/SQL in the webview. Good.

**Flag (not perf, but `AGENTS.md` §6 "No networking" violation):** `src/services/lyricsService.ts:215,221` `fetch('https://lrclib.net/api/search?...')` with 7 s abort timeout (`:200-201`), called from `usePlayerStore.ts:247-302` and `LyricsPane.tsx:166-170`. This is an online-lyrics fetch in a mission that forbids online lyrics/fetch. It does not run at idle (only on track change / missing `.lrc`), so it is **not** the idle-CPU cause, but it is the only network egress found and should be dispositioned separately.

---

## 2. Root Cause Analysis of the Two WebView2 Processes

### 2.1 Why there are exactly two renderers, always

`src-tauri/tauri.conf.json:20-48` declares **two windows**:

- `main` — 1280×800, `decorations:false`, `transparent:true`, `shadow:false`.
- `mini-island` — `url:index.html`, 360×130, `decorations:false`, `transparent:true`, `shadow:false`, `alwaysOnTop:true`, `skipTaskbar:true`, `resizable:false`, `focus:false`, `visible:false`.

Tauri/WebView2 gives **one renderer process per window/webview**. Both load the same `index.html` → `src/main.tsx`, which branches only in JS (`main.tsx:10-24`). The OS process list therefore always shows two WebView2 renderers whenever the app runs, regardless of which window is visible. `visible:false` + `mini.hide()` hides the native window; it does **not** suspend, destroy, or detach the renderer, its JS event loop, its `BroadcastChannel`, or its CSS animation clock.

Lifecycle (`App.tsx:139-248`, `MiniIslandApp.tsx:33-156`, `main.rs:79-108`):

1. Boot: both renderers start. Main mounts `App`; mini mounts `MiniIslandApp` (collapsed 140×36 pill inside a 360×130 transparent stage).
2. Idle, main focused: mini stays hidden (`syncMiniIsland` → `mini.hide()` at `App.tsx:223`). Its React tree, `onMoved` listener (`MiniIslandApp.tsx:88`), `keydown` listener (`:113-118`), `BroadcastChannel STATE_UPDATE` consumer (`useMiniPlayerStore.ts:52-56`), and all CSS keyframes remain live.
3. Main minimized (and pin enabled): `App.tsx:178-221` emits `mini-island:reveal`, repositions (`setPosition`), `show()` + `setFocus()`. Mini's 600 ms save-guard + droplet entrance (`MiniIslandCard.tsx:109-124`) run.
4. Main restored/focused: `mini.hide()` again — renderer keeps running.
5. Main closed: `main.rs:132-146` `CloseRequested|Destroyed → graceful_shutdown → app.exit(0)` exists precisely because the hidden mini kept the process alive indefinitely after main close (comment at `:79-83` documents the measured orphan: resident 15 s post-close, ~29 MB / 16 threads, single-instance handoff broken).

Mapping to the observed numbers:

- The **~26% instance is the main window**: full 1280×800 transparent stage, 3-island grid, always-on CSS animations (Section 3), plus the `useSpring` infinite rAF (Section 3.3) and the 72-bar SVG seekbar.
- The **~18% instance is the mini-island window**: a 360×130 transparent `alwaysOnTop` composited layer whose renderer never sleeps. Even hidden, Chromium still runs its JS task queue (4 Hz `BroadcastChannel` wakeups while playing; `onMoved`/focus/key listeners always) and its style/compositor clock. Its DOM is small but pathologically layer-pinned: `MiniIslandCard.tsx:217-241` sets `transform-gpu`, `transition: all 420ms var(--island-spring)`, `willChange: width, height`, `transform: translateZ(0)`, `WebkitMaskImage: -webkit-radial-gradient(white, black)`, `contain: layout style`, `isolation: isolate` — a permanently composited, masked layer on a transparent surface. `transparent:true` on **both** windows means every frame is alpha-blended through DWM; DWM itself stays cheap (~0.5%) because the cost is booked to the renderer processes doing the painting, not the compositor doing the final blend — exactly the observed split.

> Transparent-window cost is real but secondary per the brief: it multiplies whatever in-page painting already happens. The fix is to stop the in-page painting first; opaque-window conversion is listed as a last-resort design decision in §5, not the lead hypothesis.

### 2.2 What runs in each webview when "idle"

Distinguish **idle-paused** (app open, nothing playing, no hover — the state a <2% target must hold) from **idle-playing** (music playing but user AFK — still should be low single digits, but 4 Hz ticks + aura legitimately run).

**Main window, idle-paused** (nothing should move, but several things do):

- `useSpring` infinite rAF (DetentKnob volume knob, always mounted in `PlayerBar.tsx:223` → `DetentKnob.tsx:182` → `useSpring.ts:87-90`) — spins at display refresh rate forever (see §3.3). **Top suspect for the 26%.**
- `WaveformSeeker` idle shimmer: `PlayerBar` never passes `peaks`, so `idle=true` (`WaveformSeeker.tsx:80-81`) and all 72 bars get `waveform-idle-bar` infinite 1.2 s keyframes (`:274`, `index.css:403-404`) with staggered delays — even with no track and paused. No paused variant exists (contrast `eq-bar` which has `.eq-paused`).
- `.amber-breath.idle` 6 s breathe (`index.css:1014-1019`) if `AmberBreath` is mounted; `aura-pulse` is correctly paused when `pulsing=false` (`AmbientGlow.tsx:118-123`), but the `breathe` idle path is by design always-on.
- `Marquee` tickers (`PlayerBar.tsx:208-213`, `CenterIsland.tsx:274-285`) run infinite `marquee` keyframes whenever text overflows, paused or not; `ResizeObserver` re-measures on every resize (`Marquee.tsx:59-65`).
- `backdrop-filter: blur(24px)` on every `.island` (`index.css:519-520,544-545`) + `backdrop-blur-xl` on window controls (`App.tsx:867`), MicroDock, Cinema chrome — any pixel animated underneath forces a re-blur of large regions.
- `AmbientGlow` double-buffered `blur(80px)` emitters (`AmbientGlow.tsx:48,109`) repaint on palette cross-fade; static when idle, but the `aura-pulse` wrapper keeps the layer alive.

**Mini window, idle-paused (hidden):**

- React tree mounted, `BroadcastChannel` consumer live, `onMoved` + `keydown` listeners live. No `timeupdate` traffic while paused, so JS is mostly parked — but the compositor still holds the `translateZ(0)` + mask + `willChange` layer on a transparent `alwaysOnTop` surface, and any `island-capsule-pulse` / `island-eq-bar-*` classes from the last playing state must be verified cleared (they are correctly gated by `isPlaying` at `MiniIslandCard.tsx:222,291` — paused = no EQ/pulse animation, good).
- The hidden-but-alive renderer still processes window-visibility-agnostic tasks: `settleMagneticSnap` glide timers, `localStorage` writes on `onMoved`, and — critically — **it cannot be throttled by Chromium's background-tab heuristics because Tauri webviews are separate top-level windows, not tabs**. `hide()` does not yield CPU the way tab occlusion does.

**Either window, while playing (user AFK):** add the 4 Hz store fan-out (§1.2) + `AmberBreath` 60 fps CSS-var loop (if mounted) + `animate-play-pulse` box-shadow pulse + capsule pulse in both windows + EQ bars in up to three places (PlayerBar row via `EqBars`, Dynamic Island pill, Mini pill) + lyric `activeIndex` + smooth scroll. This legitimately costs more than paused-idle, but the current implementation pays full React re-render + SVG + cross-window postMessage per tick instead of direct-DOM clock writes.

---

## 3. In-Page Hotspots & Render Thrashing

Ordered by likelihood of explaining **idle-paused** CPU (the <2% target state). Playing-state costs follow.

### 3.1 [P0 — likely 26% driver] `useSpring` never stops — 60 fps rAF forever

`src/hooks/useSpring.ts:54-92`. The effect starts `requestAnimationFrame(frame)` on mount and **re-arms unconditionally at `:87`**, even after the settle-snap at `:77-80` zeroes velocity. There is no `cancelAnimationFrame` on settle, no "sleep until target changes" gate. The `target`-change effect (`:45-52`) only updates `targetRef`; it does not (re)start the loop because the loop never stopped.

Consumers:

- `src/components/controls/DetentKnob.tsx:182` — `useSpring(effective, paint, {stiffness:340, damping:30, mass:1})`. The knob lives in `PlayerBar` (`PlayerBar.tsx:223`), which is always mounted. So **one infinite 60–144 fps rAF runs from app start to quit**, doing Euler integration + `paint` DOM writes per frame (mitigated only by the `lastPaint` dedupe at `:82-85`, which still wakes the renderer every vsync to compare).
- `src/components/queue/MagneticQueue.tsx:94` — second `useSpring` instance; mounted only with that component, same never-sleeps shape.

A single always-on rAF alone keeps a WebView2 renderer out of its idle backoff and is sufficient to explain a ~20%+ renderer on a high-refresh display. This is the first thing to fix and the easiest to verify (DevTools frame meter / `requestAnimationFrame` sampling goes to zero when settled).

### 3.2 [P0 — idle shimmer] `WaveformSeeker` renders 72 infinitely-animating bars at all times

`WaveformSeeker.tsx:80-81`: `idle = !peaks || peaks.length === 0`. `PlayerBar.tsx:162-168` never passes `peaks`, so `idle` is permanently true. `:81` synthesizes 72 placeholder bars; `:274` stamps `waveform-idle-bar` on every one with staggered `animationDelay`; `index.css:363-370,403-404` runs `waveform-idle 1.2s ease-in-out infinite` (height 15%↔60%) on all 72, forever — empty library, paused, playing, it never matters.

Compounding it, `:296-300` injects a `<style>` giving every played (`fill="#EAB308"`) rect `filter: drop-shadow(0 0 4px rgba(234,179,8,0.6))`, and `progress` moves the playhead `<line>` plus per-bar `fill`/`opacity` on every 4 Hz tick while playing. SVG attribute churn + drop-shadow + 72 concurrent height keyframes is a paint-storm in the exact component that updates most often.

Note the asymmetry: `EqBars.tsx:19-25` uses the same `waveform-idle-bar` class but **does** gate `animationPlayState` on `isPlaying` — the seekbar placeholder never got the same treatment.

### 3.3 [P0 — playing + paused] `animate-play-pulse` animates `box-shadow` infinitely

`PlayerBar.tsx:96` + `PlayPauseButton.tsx:60` apply `animate-play-pulse` while `isPlaying`; `index.css:1076-1088` animates `box-shadow: 0 0 5px → 0 0 6px 1px` over 2.4 s infinite with `will-change: box-shadow` (a no-op hint — box-shadow is a paint property, not composited). Box-shadow animation forces a repaint of the button and its surroundings every frame of the pulse, in both playing states, on top of the 4 Hz React ticks. Paused state correctly drops the class (resting `shadow-[0_0_5px...]` at `PlayPauseButton.tsx:56` matches the 0% keyframe — good), so this is a playing-state cost, not an idle-paused cost — but it is the most expensive single animation per frame while playing and the cheapest to replace (opacity/transform glow).

### 3.4 [P1] `backdrop-filter` / `blur(80px)` / `drop-shadow` everywhere on transparent windows

- `.island, .island-stage, .island-queue, .island-player` — `backdrop-filter: blur(24px)` (`index.css:519-520`) + dock `nav` (`:544-545`), despite all islands being **100% opaque** (`background: #0D0F15` + gradient at `:517-518`, comment at `:509` says "100% solid, opaque"). Blurring behind an opaque layer is visually nil and computationally full-price; any animation inside (EQ, marquee, pulse, lyric fade) forces the backdrop to re-sample.
- `AmbientGlow.tsx:48` `EMITTER_BLUR = 'blur(80px)'` on two full-bleed emitters (`:126-143`), `cinema-styles.css:49` `filter: saturate(1.6) brightness(0.3) blur(80px)` on a full-window cover clone scaled 1.15. Large-radius blurs are among the most expensive filters in Chromium's software raster path, which is exactly what a transparent WebView2 window exercises.
- `backdrop-blur-xl/md/sm` on window controls (`App.tsx:867`, `CinemaStage.tsx:355,496`), `MicroDock.tsx:36`, `QueueSheet.tsx:20`, `queue-styles.css:150-151` (`blur(18px) saturate(1.3)`), `stats-styles.css:18-19` (`blur(16px)`).
- `filter: blur(2px)` idle transitions on cinema chrome (`cinema-styles.css:217-234`) — animating `filter` between `blur(0)` and `blur(2px)` forces repaint through the transition.

None of these paints on their own at rest; the problem is they **multiply** every other animation's cost because the invalidated region must be re-filtered, not just re-composited.

### 3.5 [P1] 4 Hz full-tree invalidation while playing (store + cross-window)

As detailed in §1.2: `timeupdate` → `set({currentTime})` → all subscribers + `BroadcastChannel` → mini re-render. Concretely per tick while playing:

- `PlayerBar` re-renders → `WaveformSeeker` re-renders 72 `<rect>` + playhead.
- `LyricsPane` linear `activeIndex` scan + occasional `scrollIntoView smooth` (which itself drives a multi-frame smooth-scroll animation on the main thread).
- `DynamicIslandLyrics` / `CenterIsland` / `QueuePanel` selectors re-run.
- Mini renderer wakes, re-renders time + progress width.

The tick rate is native (~4 Hz) and unthrottled ("No extra throttle" — `audio-controller.ts:18`). Seeker smoothness does not need 4 Hz React commits; the seekbar/time labels can be driven by direct DOM writes with the store updated at 1 Hz or on second-boundary change.

### 3.6 [P1] `CinemaStage` 60 fps `setState` loop while open + playing

`CinemaStage.tsx:79-96`: while `isPlaying`, `requestAnimationFrame(tick)` calls `setClockTime(live)` **every frame** (60–144 Hz React state updates), to feed `activeIdx` (`:163-176`) + lyric auto-scroll (`:179-190`, `scrollTo smooth` per active change). The comment justifies it ("native timeupdate only fires ~4Hz and lets fast phrases slip"). Correctness motive is real; cost is a full component re-render per vsync plus smooth-scroll churn. When cinema is closed the effect unmounts (no idle cost) — but while open+playing it is the heaviest JS loop in the app, heavier than `AmberBreath` (which at least avoids React state).

### 3.7 [P2] Always-on compositor keyframes (correctly gated or not)

Inventory (all `infinite` unless noted). Gating matters — an animation that runs while paused at idle is a bug; one that runs only while playing is expected cost to be reduced, not necessarily eliminated:

| Animation | Definition | Usage | Gated by `isPlaying`? | Idle-paused cost? |
|---|---|---|---|---|
| `waveform-idle-bar` 1.2 s height | `index.css:363-370,403-404` | `WaveformSeeker.tsx:274` (72 bars), `EqBars.tsx:19` (3 bars) | Seeker: **NO** — always on. EqBars: yes via `animationPlayState` | **YES — seeker shimmer runs at idle** |
| `animate-vinyl-spin` 1.8 s rotate | `index.css:343-350,395-397` | `VinylOrbit.tsx:66-67`, `CoverFlowView.tsx:356` | Yes (`animationPlayState: paused` when not playing) | Layer retained, no frame churn when paused. OK |
| `aura-pulse` 3 s scale/opacity | `index.css:352-361,399-401` | `AmbientGlow.tsx:118` | Yes (`animationPlayState: paused` when `pulsing=false`) | Paused. OK |
| `island-eq-bar-1/2/3` 0.55–0.75 s scaleY | `index.css:879-939` | `MiniIslandCard.tsx:289-292`, `DynamicIslandLyrics.tsx:180-182` | Yes (`isPlaying && class`) | Paused at scaleY(0.25). OK |
| `island-capsule-pulse` 3 s border-color | `index.css:912-944` | `MiniIslandCard.tsx:222`, `DynamicIslandLyrics.tsx:131` | Yes (`isPlaying && !isExpanded`) | Paused. OK (border-color is paint, but only while playing) |
| `animate-play-pulse` 2.4 s box-shadow | `index.css:1076-1088` | `PlayerBar.tsx:96`, `PlayPauseButton.tsx:60` | Yes | Paused. Playing-only cost (§3.3) |
| `animate-marquee` var-duration translateX | `index.css:611-623` | `Marquee.tsx:85,110` (PlayerBar ×2, CenterIsland ×2, cinema, queue) | **NO** — runs whenever text overflows, even paused | **YES if any title overflows at idle** |
| `breathe` 6 s scale/opacity (`.amber-breath.idle`) | `index.css:1021-1031` | `AmberBreath.tsx:114` (`!playing → .idle`) | Inverted — runs **when paused** by design | **YES by design** (compositor-only, cheap singly, but permanent) |
| `eq-bar` 0.9 s scaleY | `index.css:163-186` | legacy class, `EqBars` now uses `waveform-idle-bar` | Has `.eq-paused` + reduced-motion guard | Unused path. OK |
| `liquid-droplet-in` 420 ms once | `index.css:962-986` | `MiniIslandCard.tsx:223` on reveal | One-shot per reveal | Transient. OK |
| `queue-item-enter` 220 ms once | `index.css:625-641` | queue rows on mount | One-shot | Transient. OK |
| `nocturne-shimmer` 1.8 s, `stage-enter` 340 ms, `lyric-line-in` 250 ms/row | `index.css:211-235,585-604,850-862` | skeletons, stage enter, **every lyric row on every track swap** | Swap-scoped | Transient, but lyric rows re-animate *en masse* per skip |

`prefers-reduced-motion` guards exist throughout (`index.css:182-186,204-208,231-235,408-414,715-722,766-782,864-870,946-953,1033-1041,1100-1109`) — correct a11y posture, but not a perf strategy for standard-motion users.

### 3.8 [P2] Auxiliary loops & observers (bounded, verify-not-remove)

- `QueuePanel.tsx:287` `setInterval(30 s)` for relative history timestamps — only while History tab active; negligible.
- `UndoToast.tsx:67-98` rAF ring countdown — only while toast mounted (~5 s); direct DOM `strokeDashoffset`, zero re-renders. Fine.
- `useCountUp.ts:30-43` rAF count-up — only when stats visible + intersecting; `setValue` per frame for 1.6 s. Fine.
- `Marquee.tsx:59-65` `ResizeObserver` → `getBoundingClientRect` per resize per marquee instance (4+ instances). Layout reads, but event-driven, not per-frame. Fine.
- `TiltCard.tsx:43-67` mousemove → `setTransform` per pointermove (React state per move) — hover-only, pointer-driven. Fine, but `will-change-transform` permanently pins the layer (`:86`).
- `LyricsPane` scroll machinery (`:244-415`): `scrollIntoView smooth` per `activeIndex` change, 900 ms programmatic-scroll window, 2.5 s manual-scroll lock, 420 ms expand gate — well-engineered against thrash (direct quotes in comments), but still main-thread smooth-scroll per lyric line while playing.
- `QueuePanel` FLIP (`flipList.ts:59`, `QueuePanel.tsx:253-258` `useLayoutEffect` + `getBoundingClientRect` per row) — reorder-gated, not idle. Fine.

### 3.9 Explicitly ruled out (checked, not causes)

- Timers: no `setInterval` at idle except the History-tab 30 s ticker. `setTimeout`s are one-shot (debounces, guards, settle windows).
- DWM/alpha as primary: DWM at 0.5% with renderers at 26%/18% points at in-page painting, consistent with transparent windows multiplying — not causing — the load. No `box-shadow` halo outside islands at rest (codebase shows a deliberate purge: `index.css:521-523`, `AmbientGlow` "no box-shadow anywhere", `PlayPauseButton` 8 px clearance budget).
- Network polling: no polling loops; LRCLIB fetch is track-change-scoped with 7 s abort.
- SQLite: synchronous IPC only on user/library actions; `record_play` fire-and-forget per 15 s accumulated play (`usePlayerStore.ts:317-351`), not a render loop.

---

## 4. Experiment 0 Plan — Isolate the ~18% Instance (mini-island)

Goal: prove/disprove "the hidden second renderer costs ~18%" with the smallest reversible diff. **Proposal only — do not apply in this audit task.**

### 4.1 Minimal diff (two edits, no dependency changes)

**Edit A — `src-tauri/tauri.conf.json` (remove the second window):**

```diff
     "windows": [
       {
         "label": "main",
         ...
         "shadow": false
-      },
-      {
-        "label": "mini-island",
-        "url": "index.html",
-        "title": "Nocturne Mini Island",
-        "visible": false,
-        "width": 360,
-        "height": 130,
-        "decorations": false,
-        "transparent": true,
-        "shadow": false,
-        "alwaysOnTop": true,
-        "skipTaskbar": true,
-        "resizable": false,
-        "focus": false
       }
     ]
```

**Edit B — `src/App.tsx` (neutralize the producer side so no `getByLabel('mini-island')` / `emit('mini-island:reveal')` errors pollute the measurement):**

```diff
     const syncMiniIsland = async (): Promise<void> => {
+      // EXPERIMENT 0: mini-island window removed — early return, restore after measurement.
+      return;
       if (!active) return;
```

That is the entire diff. No Rust change needed (`main.rs` lifecycle hook is already scoped `if window.label() != "main"` at `:133-135`; with no mini window it is inert). No `MiniIsland*` source deletion. No capability change required (orphaned `mini.json` is harmless while its window is absent).

Optional stricter variant (if Edit A alone leaves a zombie `WebviewWindow.getByLabel` handle): also early-return `resolveWindowLabel()` to `'main'` in `src/main.tsx:10-16`. Not needed for the first run — Edit B already prevents all `show/setPosition/setFocus` calls.

### 4.2 Measurement protocol

1. Baseline: `npm run tauri dev` (or production `tauri build` + installed `.exe` — prefer production, dev-mode HMR/React StrictMode double-effects inflate renderers). Library loaded, playback **paused**, no hover, window focused, 5 min settle. Record per-process CPU in Task Manager Details (two `Nocturne.exe`/WebView2 entries + DWM) + GPU Engine column. Screenshot.
2. Apply Experiment 0 diff, rebuild identically, repeat the exact idle-paused scenario + one idle-playing scenario (same track, AFK).
3. Success criterion: second renderer row disappears and total renderer CPU drops by roughly the mini's share (~18 pts) with DWM unchanged. If the remaining main renderer stays ~26%, the mini hypothesis is confirmed as *additive* and main-window hotspots (§3.1–3.4) become the sole target. If total barely moves, the cost is shared/compositor and §5 P2 (filters/transparency) moves up.
4. Rollback: `git checkout -- nocturne-tauri/tauri.conf.json nocturne-tauri/src/App.tsx` (or `git diff` revert — only two files touched).

### 4.3 `AGENTS.md` compliance of the experiment

- No new crate / npm dependency. No network. No audio-pipeline change. No legacy-tree deletion. No commit unless asked. Two-file temporary diff, fully reversible — within "explicit owner approval" expectations for a measurement, but **ask before running** per the "Ask before adding any crate/dependency" spirit and the "verify by execution" smoke rule (`tauri dev` boot → empty state).

---

## 5. Prioritized Remediation Roadmap to Idle < 2.0%

All steps keep: Tauri v2 + React 18 + Tailwind, `HTMLAudioElement` only, Rust-owned disk/DB via `invoke` allowlist, no new crates/deps without approval, no cloud/streaming/online-lyrics expansion (the LRCLIB drift flag in §1.3 is a removal candidate, not an expansion).

### P0-1. Park the `useSpring` rAF when settled (expected: largest idle drop)

- File: `src/hooks/useSpring.ts:54-92`.
- Change: return early instead of re-arming when `value==target && velocity==0`; restart the loop on `target` change (or stiffness/damping/mass change). Keep the `lastPaint` dedupe and reduced-motion snap.
- Test: idle-paused frame meter → rAF callbacks/s from DetentKnob instance goes to 0; knob drag still springs; `MagneticQueue` drag still lifts/settles.
- Compliance: pure frontend, no IPC change.

### P0-2. Gate the seekbar idle shimmer (expected: removes 72 always-on keyframes)

- File: `src/components/WaveformSeeker.tsx:260-280`, `src/index.css:403-404`.
- Change: when `idle` (no `peaks`), render a **static** bar row (or skeleton without `waveform-idle-bar`); reserve the infinite shimmer for a loading state only, with an `isPlaying`-style `animationPlayState` pause otherwise — mirroring `EqBars.tsx:19-25`.
- Test: idle-paused → zero running `waveform-idle` animations in DevTools Animations panel; seekbar still seeks; playing progress still fills.
- Alternative (smaller): pass `isPlaying` through and set `animationPlayState: paused` when paused — one-line, keeps shimmer visual.

### P0-3. Stop waking the mini renderer when it cannot be seen

- Files: `src/stores/usePlayerStore.ts:114-135,478-481`, `src/components/MiniIsland/MiniIslandApp.tsx`, `src/stores/useMiniPlayerStore.ts:48-57`.
- Changes (pick in order, measure after each):
  1. Skip `broadcastState()` when paused **and** nothing visible changed (track/play/duration identical) — time ticks only broadcast while playing.
  2. Skip broadcast entirely while no `mini-island` window exists / is hidden (query `WebviewWindow.getByLabel` visibility before `postMessage`, or track a `miniVisible` flag set by the reveal/hide path in `App.tsx:172-228`).
  3. Long-term: lazy-create the mini window on first minimize and destroy (not hide) on restore — one renderer at a time in the common case.
- Test: hidden-mini + playing → mini renderer CPU flat; minimize → island appears with correct track/time within one tick; restore → hides again.
- This plus Experiment 0 determines whether the two-renderer architecture itself must go (single-window mini mode) or whether gating suffices.

### P1-1. Split the seek clock from the store (expected: playing-state 4 Hz → 1 Hz React)

- Files: `src/services/audio-controller.ts:18-21`, `src/stores/usePlayerStore.ts:478-481`, `src/components/PlayerBar.tsx`, `src/components/WaveformSeeker.tsx`, `src/components/MiniIsland/MiniIslandCard.tsx`.
- Change: drive seekbar fill, playhead, and time labels by **direct DOM refs** on `timeupdate` (no `set()`); commit `currentTime` to the store at 1 Hz / second-boundary (for lyrics `activeIndex`, which only needs ~1 s resolution plus the existing `CinemaStage` 60 fps loop when cinema is actually open). Keep `seekTo()` immediate-commit behavior (`audio-controller.ts:47-55` already fires handlers synchronously on seek).
- Test: playing seekbar stays smooth; React commit count/s drops ~4×; lyric line flips on time; mini progress still tracks.

### P1-2. Replace paint-property animations with compositor-only ones

- `animate-play-pulse` (`index.css:1076-1088`): animate `opacity` of a glow pseudo-layer or `transform: scale` instead of `box-shadow`. (Biggest per-frame playing saving.)
- `island-capsule-pulse` (`index.css:912-920`): `border-color` is paint — switch to an `opacity` breathe on an overlay ring, or accept as playing-only cost after P0 lands.
- `AmberBreath` 60 fps CSS-var loop (`AmberBreath.tsx:73-98`): writing `--glow-r/o/h` per frame repaints a 340–410 px radial gradient per frame. While playing, drop to ~10 Hz var updates + CSS `transition` interpolation, or pre-bake 3 gradient stops and cross-fade `opacity` (the `AmbientGlow` double-buffer pattern at `AmbientGlow.tsx:84-96` already proves the technique).
- `CinemaStage` rAF (`CinemaStage.tsx:79-96`): throttle `setClockTime` to lyric-density-adaptive rate (e.g. 10–15 Hz, or next-line-deadline scheduling) instead of every vsync; keep the vsync loop only as a `scrollTo` smoother, writing to refs.
- Test each with playing-state renderer CPU + visual A/B (pulse/breathe/glow must look identical at a glance).

### P2-1. Remove visually-nil blurs on opaque surfaces

- `index.css:509-530,538-547`: islands are opaque (`#0D0F15` + gradient) — `backdrop-filter: blur(24px)` blurs content that can never show through. Remove (or scope to genuinely translucent overlays: drop overlay `App.tsx:1052`, queue sheet, palette). Same for `backdrop-blur-xl` on opaque `bg-[#121419]/90` controls where alpha ≥ 0.9 makes the blur imperceptible.
- `AmbientGlow` `blur(80px)` + cinema `stage-glow` `blur(80px)`: pre-blur the gradient stops (wider falloff, lower alpha) and drop the filter, or reduce radius + cache as a static asset. Verify against the "transparent-window halo" notes before touching (the codebase intentionally removed outer shadows for this reason — do not reintroduce any `box-shadow` that paints outside islands).
- Test: screenshot pixel-diff + idle/playing CPU; expect multiplicative win with every animation left running.

### P2-2. Marquee + breathe hygiene at idle

- `Marquee.tsx`: pause `animate-marquee` when `document.hidden`, when window blurred, or when `isPlaying===false && view!=='stage'` — at minimum add `animation-play-state: paused` wiring (hover-pause exists; idle-pause does not).
- `.amber-breath.idle`: keep (cheap, compositor-only scale/opacity) — listed here only so it is measured, not removed. If idle still >2% after P0/P1, gate `breathe` behind `IntersectionObserver`/visibility.
- `lyric-line-in` 250 ms per row (`index.css:850-862`): fine (swap-scoped), no action unless skip-spam profiling shows otherwise.

### P3. Structural (only if P0–P2 miss <2%)

- Single-renderer mini mode: render the island in the main window's top-center (it already docks at `MINI_TOP_DOCK_Y`) and drop the second window, **or** `transparent:false` + opaque main window with rounded islands drawn in CSS (kills WebView2 alpha path entirely but changes the floating aesthetic — needs owner design sign-off; explicitly conflicts with the current transparent-island language, so propose, don't assume).
- Store split: separate `currentTime` atom from the rest of `PlayerSnapshot` so time ticks never touch queue/track subscribers even before P1-1 lands.
- Remove or gate the LRCLIB online path (§1.3) per `AGENTS.md` no-net rule — saves no idle CPU (track-change-scoped) but restores the safety guarantee; local `.lrc` + embedded tags only.

### Acceptance & measurement for every step

- Scenario matrix: (a) idle-paused focused, (b) idle-paused minimized-with-mini, (c) playing AFK, (d) cinema open + playing. Each: 5 min settle, production build, Task Manager per-renderer CPU + DWM, plus Edge DevTools Performance frame meter sampling before/after.
- Gate: no step lands unless its scenario-(a) delta is measurable and no scenario regresses. Target: scenario (a) < 2.0% sustained, (c) low single digits.
- `AGENTS.md` gates per step: `npm run tauri dev` smoke (boot → empty state, no errors), no new crates/deps without asking, never claim "verified" from a headless log — report observed numbers only.

---

## Appendix A. Files inspected (evidence index)

`nocturne-tauri/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` (mini sync `:139-248`, maximize sync `:109-134`), `src/index.css` (all keyframes/utilities), `src/stores/usePlayerStore.ts` (full), `useUIStore.ts`, `useMiniPlayerStore.ts`, `useAmbientPalette.ts`, `useLyricOffset.ts`, `src/services/audio-controller.ts`, `player-broadcast.ts`, `lyricsService.ts`, `src/hooks/useSpring.ts`, `useTrackSwapFade.ts`, `src/components/ambient/AmberBreath.tsx`, `AmbientGlow.tsx`, `CenterIsland.tsx`, `PlayerBar.tsx`, `WaveformSeeker.tsx`, `VinylOrbit.tsx`, `Marquee.tsx`, `TiltCard.tsx`, `EqBars.tsx`, `DynamicIslandLyrics.tsx`, `LyricsPane.tsx`, `QueuePanel.tsx`, `queue/UndoToast.tsx`, `queue/MagneticQueue.tsx`, `queue/flipList.ts`, `stats/useCountUp.ts`, `controls/PlayPauseButton.tsx`, `controls/DetentKnob.tsx`, `cinema/CinemaStage.tsx`, `cinema/cinema-styles.css`, `cinema/useIdle.ts`, `MiniIsland/MiniIslandApp.tsx`, `MiniIsland/MiniIslandCard.tsx`, `MiniIsland/magneticSnap.ts`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/capabilities/default.json`, `mini.json`.

## Appendix B. What this audit did NOT do

No source, config, or dependency file was created, modified, or deleted. No profiler, build, or `tauri dev` run was performed. The `PERFORMANCE_AUDIT_REPORT.md` deliverable itself is the only file written, at the workspace root, outside `nocturne-tauri/src/`, `src-tauri/`, and configs. Experiment 0 and the roadmap are proposals with exact diffs for the owner to approve and apply.
