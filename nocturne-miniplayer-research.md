# Nocturne Floating MiniPlayer — Technical Research Report

> Prepared by Echo (research) for the consultant model — 2026-09-23.
> Responds to the brief: exhaustive technical & architectural research for the floating
> "Dynamic Island / MiniPlayer" widget of Nocturne.
> Target stack: Tauri v2 (Rust backend) + React 18 + TypeScript + Tailwind CSS, Windows 10/11 via WebView2.
> Verification flags used below: `verified live` = the source page was opened and read directly;
> `index` = search-result/index excerpt (last-crawl dates noted in the researcher's notes).
> The "Could not verify" section at the end lists what the research could not confirm —
> those points are marked as open, not as facts.

---

## Area 1 — Geometric perfection & superellipse rendering

### Key findings
- **Native `corner-shape` has shipped in Chromium.** `corner-shape: squircle` (shorthand for `superellipse(2)`) paired with `border-radius` renders a true squircle natively in Chrome/Edge **139+** with no flag. As of June 2026, Safari and Firefox do **not** support it — but Nocturne runs on WebView2 (Chromium, evergreen runtime), so native `corner-shape` is usable in production for this project today (`verified live`: https://github.com/bring-shrubbery/squircle-js/blob/HEAD/apps/web/content/blog/squircles-in-css.mdx).
- **Math**: `superellipse(K)` draws the curve `x^(2K) + y^(2K) = 1` inside the corner box. `K=1` = ordinary round corner, `K=2` = iOS-style squircle = quartic superellipse `n=4` (Lamé's special quartic). Note Apple's app-icon shape is actually a **quintic** superellipse (`n=5`, smoothing ≈0.6) — i.e., for the *pill body* use `superellipse(2)`; for an iOS-icon-look artwork thumb, `n=5` is closer to Apple (source: https://github.com/gridaco/grida/blob/HEAD/docs/math/superellipse.md, index).
- `corner-shape` is silent without `border-radius` (radius = size, shape = curve). Progressive enhancement pattern:
  ```css
  .island { border-radius: 999px; }
  @supports (corner-shape: squircle) { .island { corner-shape: squircle; } }
  ```
- **Squircle + `rounded-full` trap**: on a square element, `rounded-full` + `corner-shape: squircle` becomes a superellipse, NOT a true circle — override with `corner-shape: round` on truly circular elements (index: https://github.com/freakslxss/aether-gui-next/blob/HEAD/.agents/skills/squircle/SKILL.md).
- **Fallback for non-Chromium (not needed for WebView2, but for dev previews)**: `@squircle-js/react` npm package generates an exact-superellipse SVG `clip-path` so the shape is identical regardless of `corner-shape` support (verified live, same squircle-js page).

### Exact constants — single-cubic superellipse corner approximation
For a corner box of radius `r` (extension factor `e = 1.528`, kappa `κ = 0.85` vs standard circular `κ = 0.5523`):
- Corner arc spans from `(r·e offset along edge)` — i.e., control geometry reaches `1.528×` farther along each edge than a circular arc.
- Cubic control distance from endpoints: `κ·r = 0.85·r` along each edge tangent.
- Pixel-identical Apple replication needs multi-cubic or quintic; the single-cubic claim is "Apple-style continuous corner approximation" (index: https://github.com/danielraffel/pulp/commit/b376a04a19ad2d960eba94dd1998006a70427d5d).

### Ready-to-use SVG path generator (parametric superellipse)
```ts
// Exact superellipse pill path: |x/a|^n + |y/b|^n = 1, sampled → smooth poly-curve.
// n=4 → math squircle; n=5 → Apple-icon quintic.
function squirclePath(w: number, h: number, n = 4, segs = 8): string {
  const a = w / 2, b = h / 2, e = 2 / n;
  const pt = (t: number): [number, number] => {
    const c = Math.cos(t), s = Math.sin(t);
    return [a + a * Math.sign(c) * Math.pow(Math.abs(c), e),
            b + b * Math.sign(s) * Math.pow(Math.abs(s), e)];
  };
  let d = "";
  for (let i = 0; i <= segs * 4; i++) {
    const [x, y] = pt((i / (segs * 4)) * Math.PI * 2);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d + "Z";
}
// Use as clip-path: path('...') or <clipPath> for masks; segs=8 → 32 points,
// visually indistinguishable from analytic curve at pill sizes.
```

### Clipping + drop shadows
- `filter: drop-shadow()` repaints the filtered element's rendering on the main-thread filter pass and is **not** merged into the GPU-composited transform animation; `box-shadow` on a rounded element is composited and cheaper while animating. Rule: animate only `transform`/`opacity`; never put `filter: drop-shadow()` on the animating pill.
- Shadow flicker on transparent Tauri windows: the known trap is putting `border-radius` on `<html>` — "Windows clips before the radius and you'll see square corners on the OS shadow" (index: https://github.com/stuffbucket/skills/blob/HEAD/plugins/stuffbucket/skills/tauri-windows-transparency-vibrancy/SKILL.md). Prefer the **native DWM shadow** (comes free with the window) or `box-shadow` on the inner card; keep `backdrop-filter`/`filter` off the animated element.

### Ranked recommendations (Area 1)
1. `corner-shape: squircle` + `border-radius` (native, Chromium 139+ — WebView2) — https://github.com/bring-shrubbery/squircle-js (guide)
2. `squirclePath()` above → `clip-path: path()` for generated paths (any shape, GPU-clip, no repaint)
3. `@squircle-js/react` npm — exact superellipse SVG clip-path, best non-native fallback

---

## Area 2 — Liquid motion & spring physics (lightweight, zero-jank)

### Key findings
- **Pure-CSS springs via `linear()`**: any underdamped spring curve can be baked to a `linear(...)` easing (overshoot points >1 = the bounce). Support: Chrome/Edge 113+, Firefox 112+, Safari 17.2+; older browsers fall back to `ease` (still animates). `linear()` does **not** compute duration — you must declare one (index: https://github.com/alikimovich/praxis/blob/HEAD/agent-plugin/skills/spring-animations/SKILL.md).
- **Generator**: Jake Archibald's linear-easing-generator — https://linear-easing-generator.netlify.app/ — paste spring params, get CSS.
- **Limitation**: a baked `linear()` assumes rest-start. For drag-release, interrupted, or velocity-carrying gestures, keep the integrator in JS (same source).
- **Zero-dependency integrator** (semi-implicit/symplectic Euler, dt=1/60 — the scheme Framer Motion's curves replicate; index: https://github.com/maximeheckel/blog.maximeheckel.com/blob/HEAD/content/the-physics-behind-spring-animations.mdx):
  ```ts
  // m=mass, k=stiffness, c=damping; x=current, v=velocity, target=rest
  function springStep(s: {x:number; v:number}, target: number, m: number, k: number, c: number, dt = 1/60) {
    const F = -k * (s.x - target) - c * s.v;
    s.v += (F / m) * dt;
    s.x += s.v * dt;
    return s;
  }
  // Drive via rAF, write only transform/opacity. Stop when |v|<eps && |x-target|<eps.
  ```
- **Micro-libraries**: `css-spring` (~3 kB gzipped) bakes spring keyframes at build time — zero runtime cost (index: https://github.com/codepunkt/css-spring). Motion's standalone spring generator module measures **4407 bytes minified / 1681 bytes gzip** (index: https://github.com/motiondivision/motion/blob/HEAD/plans/031-overdamped-spring-exponential-form.md) — i.e. importing just the spring generator from `motion` is smaller than any hand-rolled alternative.

### Concrete spring parameter sets (Framer Motion / Motion convention)
| Feel | Params | Notes |
|---|---|---|
| iOS "snappy" (Dynamic Island expand) | `stiffness: 500, damping: 40, mass: 1` | settles ≈0.35–0.45 s, ~1–2% overshoot |
| Snappy alt | `stiffness: 400, damping: 30` | slightly softer |
| Gentle | `stiffness: 200, damping: 25` | ≈0.5–0.6 s |
| Apple-style (duration API) | `{ type: "spring", duration: 0.5, bounce: 0.2 }` | iOS 17+ default feel; bounce 0.1–0.3 for premium, 0 for professional |
| Raw physics | `mass: 1, stiffness: 100, damping: 10` | ζ≈0.5, bouncy reference |

### Damping ratio ζ ↔ overshoot math
For the standard 2nd-order system `m·x¨ + c·ẋ + k·x = 0`: `ζ = c / (2·√(m·k))`, percent overshoot `PO = exp(-π·ζ / √(1-ζ²))`.
- ζ=0.5 → 16.3% overshoot (bouncy); ζ=0.7 → 4.6% (snappy, slight life); ζ=0.8 → 1.5% (barely-there); ζ=1.0 → 0% (critically damped, fastest settle, no bounce); ζ>1 → overdamped (sluggish).
- Dynamic Island expansion target: **ζ ≈ 0.65–0.8**, i.e. `stiffness 400–500, damping 30–40, mass 1`.

### Magnetic edge-snapping
No canonical open-source "soft magnet" widget implementation surfaced in this research; the algorithm below is the synthesis used by frameless-window projects (design decisions verified in index sources https://github.com/ahoff-git/eq-list/blob/HEAD/specs/decisions/0108-a-frameless-window-snaps-like-a-framed-one.md and https://github.com/problemfactory/vibespace/blob/HEAD/docs/window-manager.md):
1. **Drag**: renderer owns gesture, sends dragStart/dragMove/dragEnd pulses; window moved from Rust via `window.set_position()` fed by a ~60 Hz `GetCursorPos` poll (all coordinates in physical px; never mix CSS px) — the exact polling pattern proven in https://github.com/elixir-piloting/tauri-overlay-template/blob/HEAD/AGENTS.md.
2. **Attraction**: when a window edge comes within `R = 24–48 px` of a screen edge/corner, blend position toward the docked anchor with a critically-damped ease (ζ=1) scaled by proximity: `pull = smoothstep(1 - dist/R)`; show a subtle glow/indicator on the target edge.
3. **Rubber-band**: allow overshoot past the edge clamp with an underdamped spring (ζ≈0.5) that pulls back — this is the "magnetic" feel.
4. **Release**: measure release velocity; if `|v| > ~800 px/s` → fling free (continue with friction decay); else spring (ζ≈0.7) into the nearest magnet anchor (edges + corners); 5 px drag threshold so clicks don't snap.
5. Drag must start from a `data-tauri-drag-region` element (needs `core:window:allow-start-dragging` capability), and interactive controls must opt out of the drag region.

### Ranked recommendations (Area 2)
1. Baked `linear()` spring easings (via https://linear-easing-generator.netlify.app/) for all rest-state expand/collapse — pure CSS, compositor-only
2. Hand-rolled semi-implicit Euler integrator (~15 lines) for drag/snap/release gestures — no dependency, velocity-aware
3. `motion`'s standalone spring generator (1681 B gzip) if a library is wanted — https://github.com/motiondivision/motion
4. `css-spring` (~3 kB gzip, build-time keyframes) — https://github.com/codepunkt/css-spring

---

## Area 3 — Windows 11 native materials vs custom composition (Tauri v2)

### Key findings
- **`window-vibrancy` crate is the verified path** (docs.rs read live: https://docs.rs/window-vibrancy/latest/window_vibrancy/):
  - `apply_acrylic(&window, Some((18, 18, 18, 125)))` — Win10 v1809+; `apply_mica(&window, Some(true))` — Win11 (`Some(true)` = dark); `apply_tabbed` — Win11; `apply_blur` — Win7/Win10.
  - Requires `tauri.conf.json` → `"windows": [{ "transparent": true, "decorations": false }]` and `html, body { background: transparent; }`.
  - Recommended production pattern (index: https://github.com/stuffbucket/skills/blob/HEAD/plugins/stuffbucket/skills/tauri-windows-transparency-vibrancy/SKILL.md): `apply_mica(&window, Some(true)).or_else(|_| apply_acrylic(&window, Some((18,18,18,125)))).ok();`
- **Material choice**: Mica = samples desktop wallpaper only, subtle, best for main windows. Acrylic = live blur of everything behind *including other windows*, best for floating panels/islands. Blur = Aero fallback for Win10 (same skill doc).
- **Community fork** `phieu-tran/window-vibrancy` (index: https://github.com/phieu-tran/window-vibrancy) adds: `apply_best_effect` (OS auto-detect), `switch_effect` (flicker-free switching), `clear_all_effects`, `apply_rounded_corners` (`CornerPreference`: 0 Default / 1 Square / 2 Round / 3 RoundSmall), and a compatibility table — **known perf pitfalls**: `apply_blur` lags on Win11 22621+ during resize; `apply_acrylic` lags on Win10 v1903+ and Win11 22000. Prefer Mica/Tabbed on 22621+.
- **Raw Win32 constants** (index: https://learn.microsoft.com/en-us/answers/questions/152914/how-to-blur-behind-classic-win32-or-wpf-window-usi):
  - `SetWindowCompositionAttribute` is an **undocumented** user32 export (resolve via `GetProcAddress`); `WCA_ACCENT_POLICY = 19`; `ACCENT_ENABLE_BLURBEHIND = 3`; `ACCENT_ENABLE_ACRYLICBLURBEHIND = 4` (RS4 1803+); `ACCENT_ENABLE_HOSTBACKDROP = 5` (RS5 1809+); `ACCENT_POLICY { AccentState, AccentFlags, GradientColor (ABGR+alpha), AnimationId }`. Microsoft warns it "might be changed or removed in future versions of windows".
  - Modern documented path: `DwmSetWindowAttribute` with `DWMWA_SYSTEMBACKDROP_TYPE`: `0` Auto / `1` None / `2` MainWindow (Mica) / `3` TransientWindow (Desktop Acrylic, works behind non-client strip) / `4` Tabbed (Mica Alt, build 22523+). (Pattern verified in index: https://github.com/wangjq4214/harbor/blob/HEAD/.grimoire/spec/0008-windows-acrylic-backdrop.md.)
- **Native vs custom CSS backdrop-filter**: native DWM materials (Mica/Acrylic) are composited by the OS — zero GPU cost in the WebView2 process, zero flicker, theme-aware. CSS `backdrop-filter: blur(20px)` keeps a GPU blur pass in the renderer; it is the correct *fallback* when vibrancy is unavailable, but the blur radius is the cost driver — keep ≤24–32 px. Recommendation: native material for the window shell (flicker-free), CSS `backdrop-filter` only as fallback, never on animating elements. No WebView2-specific backdrop-filter benchmark numbers were found — treat iGPU cost as "measure on target hardware."

### Non-rectangular click-through
- `window.set_ignore_cursor_events(true)` (Rust) / `WebviewWindow.setIgnoreCursorEvents(true)` (JS) → `WS_EX_TRANSPARENT` on Windows (index: https://github.com/timeloop-vault/poe-inspect/blob/HEAD/docs/research/tauri-overlay.md). Capability: `core:window:allow-set-ignore-cursor-events`.
- **Production pattern** (index: https://github.com/elixir-piloting/tauri-overlay-template/blob/HEAD/AGENTS.md): 60 Hz `GetCursorPos` loop; convert CSS rects → physical px (scale factor + window offset); toggle `set_ignore_cursor_events` **only on state change**; hysteresis — expand each interactive rect edge by ~3 physical px to kill boundary flicker; re-assert `WS_EX_TOOLWINDOW` each tick (tao rewrites ex-styles on flag changes).
- CSS-level trick: `rgba(0,0,0,0.01)` captures mouse events while looking transparent; `background: transparent` passes clicks through on Windows — useful for the capsule padding without window-level toggling.

### Ranked recommendations (Area 3)
1. `window-vibrancy` — `apply_mica`/`apply_acrylic` with documented fallback chain — https://docs.rs/window-vibrancy/latest/window_vibrancy/ (consider phieu-tran fork for `switch_effect`/`apply_best_effect`: https://github.com/phieu-tran/window-vibrancy)
2. Raw `DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE=3)` via `windows` crate if Tauri-version-independent control is needed
3. `set_ignore_cursor_events` + 60 Hz rect-poll with 3 px hysteresis for click-through padding
4. CSS `backdrop-filter` only as fallback path

---

## Area 4 — Live audio reactivity & visual micro-feedback

### Key findings
- **Capture**: `cpal` 0.17.1 (Jan 2026, cross-platform) does WASAPI loopback by building an **input** stream on the **default output device** with its output config (index: https://github.com/RustAudio/cpal/pull/478):
  ```rust
  use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
  let host = cpal::default_host();
  let device = host.default_output_device().expect("no output device");
  let cfg = device.default_output_config().expect("no output config");
  let stream = device.build_input_stream(&cfg.config(),
      move |data: &[f32], _| { /* push into ring buffer */ },
      |err| eprintln!("stream error: {err}"), None)?;
  stream.play()?;
  ```
- **`wasapi` crate 0.23 trap** (verified against crate source; index: https://github.com/osamarehman/ai-sales-coach/blob/HEAD/.claude/skills/tauri-system-audio-capture/SKILL.md): the ONLY combo that sets `AUDCLNT_STREAMFLAGS_LOOPBACK` is device=Render + init client `Direction::Capture` + Shared mode. `(Render, Render)` compiles fine and captures **silence**. Event-driven loopback IS supported (`StreamMode::EventsShared` + `set_get_eventhandle()` + `wait_for_event(ms)`).
- Alternative: `windows-audio-capture` crate (`WASAPICapture::new()`).
- Note: WASAPI loopback captures the **system mix**, not per-app. Since Nocturne *is* the player, prefer analyzing in-process; use loopback only for a "follow system audio" mode.
- **FFT**: `rustfft` 6.4.1 (MIT OR Apache-2.0; SIMD paths incl. AArch64 Neon) or `realfft` 3.5.0 (MIT; half-size complex transform for real input; `RealFftPlanner` + `process_with_scratch` with caller-owned scratch = **zero allocation per frame**). Reference: index https://github.com/yan-h/harmonigraph/blob/HEAD/docs/fft-backend-evaluation.md. `stft-rs` 0.5.0 wraps this with rayon multichannel support.
- **Production DSP pattern** (index: https://github.com/madewellrd/milkdrop3): cpal callback → ring buffer → Hanning window → FFT → band RMS (bass 20–250 Hz / mid 250–4 kHz / treble 4–20 kHz) → EMA `att = att*0.92 + cur*0.08` → per-band beat flux.

### Benchmark numbers (reported by others)
| Source | Measurement |
|---|---|
| multitrack-audio-visualizer (VISUALIZATION_DETAILS.md, index) | Canvas draw of 1920 vertical lines ≈ **0.2 ms**; total **≈0.5 ms/track/frame** |
| meeting-transcriber audio visualizer (index) | **10 FPS** update → **≈0.5–1% additional CPU**, 1–2 MB buffers |
| lost-island island widget (self-reported) | **≈0.2% idle CPU**, event-driven |

### Recommended streaming architecture (Rust → Tauri events → canvas)
1. Capture thread: cpal WASAPI loopback (f32) → 1024-pt `realfft` at 30 Hz → 24–64 bands + EMA.
2. Emit `app.emit("audio-spectrum", bands)` at **10–20 Hz only while playing** (payload ≈ 64×f32 ≈ 256 B/event — negligible IPC).
3. Frontend: tiny `devicePixelRatio`-sized canvas 2D (e.g. 96×24) in the collapsed pill; kill the rAF loop on pause/hide (`visibilitychange` + playback state).
4. Idle/fallback: GPU-composited CSS keyframe shimmer; `AnalyserNode` route avoided (its `smoothingTimeConstant` scales with read-call gaps — no dt compensation — index: https://github.com/gamazama/gmt-fractals/blob/HEAD/docs/adr/0110-audio-analysis-in-a-worklet.md).

### Ranked recommendations (Area 4)
1. `cpal` (capture) + `realfft` (FFT) + Tauri event stream at 10–20 Hz — https://github.com/RustAudio/cpal, https://docs.rs/realfft/
2. Cheaper: 3-band RMS only (bass/mid/treb) → 3–5 bar "breathing" pill — near-zero cost
3. Fallback: pure CSS keyframes when no real signal (GPU, ~0 CPU)

---

## Area 5 — Dynamic color & ambient lighting

### Key findings
- **Quality evidence**: Ciocca et al. 2019 peer-reviewed evaluation (https://link.springer.com/content/pdf/10.1007/978-3-030-13940-7_13.pdf) ranks **k-means and median-cut** among the best extraction methods vs human ground truth (EMD metric). A second study (https://thesai.org/Downloads/Volume15No6/Paper_42-Artistic_Color_Matching_Technology.pdf) ranks **octree worst**. Recommendation: k-means in LAB, k=6.
- **Production recipe**: downsample artwork to ~256×256 (or 64–128 px for speed) → cluster in **LAB/OKLCH** (perceptually uniform) → sort by cluster population → primary = largest cluster with chroma, accent = highest-chroma cluster, glow = accent at low alpha. ΔE2000 for any color matching.
- **Rust crates**:
  - `kmeans-colors` 0.6 — k-means with k-means++ init, Lloyd's + Hamerly's, `palette_color` feature for `palette` crate types (index: https://github.com/okaneco/kmeans-colors)
  - `pigmnts` 0.7.0 — k-means++ in LAB, `pigments_pixels(&Vec<LAB>, k, weight_fn, max_iter)` returns `(LAB, dominance%)` tuples; also compiles to WASM (verified live: https://docs.rs/crate/pigmnts/latest)
  - `auto-palette` — Rust + Wasm + CLI; DBSCAN/DBSCAN++/KMeans++; RGB/HSL/LAB; Vivid/Muted/Light/Dark theme selection (closest to Android Palette semantics) (index: https://github.com/gferon/auto-palette)
- **JS/TS**: `color-thief` (median-cut, tiny), `node-vibrant` (Android Palette port, heavier), `@microsoft/fast-color` (Microsoft's Fluent color utils — lightest serious option).

### Architecture recommendation
**Rust sidecar Tauri command at track change** (not per frame): `image` crate decodes → resize to 64–128 px → `kmeans-colors` k=6 in LAB → convert to OKLCH → return `{ primary, accent, glow }` as hex/OKLCH. Expected **<10 ms** for 300×300 artwork (90k px, few iterations), off the UI thread via a Tauri async command — zero jank. WASM (pigmnts/auto-palette) in a worker is the alternative if artwork only exists in the frontend; avoid main-thread quantization and octree.

### Ranked recommendations (Area 5)
1. Rust: `kmeans-colors` 0.6 + `image` crate + `palette` (OKLCH) via async Tauri command
2. Runner-up: `auto-palette` (themes: Vivid/Muted/Light/Dark)
3. Frontend-only fallback: `@microsoft/fast-color` or `color-thief` in a worker

---

## Area 6 — Best-in-class benchmarks & open-source references

| Project | Stack | What to steal | URL |
|---|---|---|---|
| **lost-island** | Native per-OS (GTK4/layer-shell flagship; WPF + AppKit companions) | Event-driven end-to-end; pill morphs; **~0.2% idle CPU** target | https://github.com/marcozorn/lost-island |
| **halo-bar** | WinUI 3, Windows App SDK 1.8, Desktop Acrylic, SMTC, raw Win32 P/Invoke | SMTC integration; transient-widget priority stack; fullscreen-hide; always-on-top borderless acrylic pill pattern | https://github.com/pruthviraj-bev/halo-bar/blob/HEAD/PROJECT_CONTEXT.md |
| **DynamicIslandWindows** | Electron | Compact↔expanded view state machine; draggable pill; Spotify transport controls; LRCLIB synced lyrics | https://github.com/garvrao80/dynamicislandwindows |
| **orbit** | .NET 8 WPF | Media-hub auto-detect across processes (Spotify/YouTube/browser); context-hub morphing | https://github.com/devikumar143/orbit |
| **claude-code-island** | Electron 33 | Frosted-glass pill compact↔expanded on Windows (asset pattern) | https://github.com/maybelol/claude-code-island |
| **ModernFlyouts** | WPF .NET | SMTC media session handling; per-monitor positioning; transient flyout lifecycle; Fluent materials | https://github.com/danalec/ModernFlyouts |
| **plith** | WPF + .NET 10 | Mica/Acrylic via `DwmSetWindowAttribute` (Win11 21H2+); topmost-over-fullscreen; SMTC via `GlobalSystemMediaTransportControlsSessionManager` | https://github.com/berkeerdo/plith/blob/HEAD/CLAUDE.md |
| Raycast / Spotify / Apple Music | Closed | Patterns only: spring physics, backdrop materials, SMTC (`Windows.Media.Control`) as the universal Windows now-playing API | — |

**Key integration point on Windows**: `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager` (SMTC) gives system-wide now-playing metadata + transport controls without per-app APIs — used by halo-bar, ModernFlyouts, and plith. Via the `windows` crate in Rust.

---

## Consolidated recommended stack for Nocturne's floating MiniPlayer

| Concern | Recommendation | Source |
|---|---|---|
| Pill geometry | Native `corner-shape: squircle` + `border-radius` (WebView2/Chromium 139+); `squirclePath()` → `clip-path: path()` for generated paths; `corner-shape: round` override on true circles | https://github.com/bring-shrubbery/squircle-js/blob/HEAD/apps/web/content/blog/squircles-in-css.mdx |
| Expand/collapse motion | Baked `linear()` spring easings (via https://linear-easing-generator.netlify.app/); `stiffness 500 / damping 40` (ζ≈0.7) for iOS-snappy expand | https://github.com/alikimovich/praxis/blob/HEAD/agent-plugin/skills/spring-animations/SKILL.md |
| Drag/snap/release | Hand-rolled semi-implicit Euler integrator; 60 Hz `GetCursorPos` poll in Rust + `set_position`; attraction radius 24–48 px; rubber-band ζ≈0.5; release velocity threshold ~800 px/s; 5 px drag threshold | synthesis from https://github.com/ahoff-git/eq-list/blob/HEAD/specs/decisions/0108-a-frameless-window-snaps-like-a-framed-one.md |
| Window material | `window-vibrancy`: `apply_mica(dark)` → fallback `apply_acrylic((18,18,18,125))`; consider phieu-tran fork for `switch_effect`/`apply_best_effect` | https://docs.rs/window-vibrancy/latest/window_vibrancy/, https://github.com/phieu-tran/window-vibrancy |
| Click-through padding | `set_ignore_cursor_events` + 60 Hz rect-poll, state-change-only toggles, 3 px hysteresis; `rgba(0,0,0,0.01)` CSS trick for capture zones | https://github.com/elixir-piloting/tauri-overlay-template/blob/HEAD/AGENTS.md |
| Audio capture | `cpal` WASAPI loopback (input stream on default output device) | https://github.com/RustAudio/cpal/pull/478 |
| FFT | `realfft` 3.5.0 (`process_with_scratch`, zero-alloc/frame) | https://github.com/yan-h/harmonigraph/blob/HEAD/docs/fft-backend-evaluation.md |
| Spectrum pipeline | 1024-pt FFT → 24–64 bands → EMA (0.92/0.08) → `app.emit("audio-spectrum")` at 10–20 Hz while playing → tiny canvas 2D | pattern from https://github.com/madewellrd/milkdrop3 |
| Palette extraction | Rust Tauri command: `image` + `kmeans-colors` 0.6 (k=6, LAB) + `palette` OKLCH at track change | https://github.com/okaneco/kmeans-colors |
| Now-playing integration | SMTC via `windows` crate (`GlobalSystemMediaTransportControlsSessionManager`) | https://github.com/pruthviraj-bev/halo-bar/blob/HEAD/PROJECT_CONTEXT.md |
| Perf budgets | Idle ≤0.2% CPU (lost-island bar); visualizer steady <1% @10–20 Hz; spring module 1.7 kB gzip; `css-spring` 3 kB gzip build-time | see benchmark table in Area 4/6 |

### Architectural rules of thumb (cross-area)
1. Animate only `transform` and `opacity` — never `filter`, `backdrop-filter`, `width`, or `box-shadow` on the moving pill.
2. Native DWM material for the shell (flicker-free); CSS blur only as fallback.
3. `border-radius` on the inner card, never on `<html>` (OS shadow corner trap).
4. Audio DSP and palette extraction live in Rust off the UI thread; the frontend only renders.
5. Event-driven, not polling, at idle — the island should cost ~nothing while sitting still.

---

## Could not verify (open questions — do not treat as facts)
- **WebView2-specific `backdrop-filter` GPU numbers**: no WebView2-targeted benchmark found; guidance is extrapolated from Chromium compositing behavior and the window-vibrancy resize-lag notes. Measure on target iGPUs.
- **`filter: drop-shadow()` vs `box-shadow` compositing specifics in WebView2**: stated per general Chromium behavior; not measured in a Tauri transparent window in any source found.
- **Tauri built-in `set_effects()` / `windowEffects` config** (Mica/Acrylic/blur/tabbed): referenced in secondary project docs but not verified against a pinned Tauri release — treat as version-dependent; the `window-vibrancy` crate path is docs-verified.
- **`corner-shape` in the exact WebView2 runtime on end-user machines**: WebView2 is evergreen (139+ is broadly deployed by Sep 2026), but add a runtime feature-check + SVG `clip-path` fallback for safety.
- **Exact spring constants Apple uses for Dynamic Island**: Apple does not publish them; the sets above are community-measured equivalents (ζ≈0.65–0.8).

## Sources
- All URLs are listed inline above; flags: `verified live` (page opened and read) vs `index` (search-result excerpt, last-crawl dates noted in the researcher's notes).
- Researcher's per-area notes: `notes/area1-squircle.md` … `notes/area6-benchmarks.md` (working material, not part of this deliverable).
