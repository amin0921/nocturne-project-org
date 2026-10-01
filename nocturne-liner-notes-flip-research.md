# Nocturne: 3D Album Card Flip & Vintage Studio Liner Notes — Technical Specification

> **Target stack:** Tauri v2 · Rust backend · React 18 · TypeScript · Tailwind CSS v4 · SQLite · WebView2/Chromium (Windows 10/11).
> **Hard constraints:** zero heavy external 3D/animation bundles — no Three.js, no Canvas rendering, no Framer Motion. Pure CSS 3D transforms, Web APIs, idiomatic React 18, locked 60 fps.
> **Palette:** Obsidian `#0D0F15`, Studio Amber `#EAB308` / `#F59E0B`.

**Evidence legend used throughout:** `[verified live]` = confirmed by direct browser render or primary documentation read during this session · `[index]` = read via the web index during this session · `[unverified]` = single-source, empirical, or Chromium-version-dependent claim (all collected in the final section — never presented as fact).

**Normative rule for this document:** where Chromium behavior could not be confirmed in a primary source, the text says so explicitly.

---

## 1. Chromium / WebView2 3D Rasterization Blur & Crisp Typography

### 1.1 Root cause: why 3D flips blur text in Chromium

Chromium renders the page in stages (style → layout → paint → composite). When an element is promoted to its own **compositor layer** — which happens implicitly with `transform-style: preserve-3d`, `perspective`, non-`none` 3D `transform`, `will-change: transform`, or `backface-visibility: hidden` — its painted output is **baked into a GPU texture (bitmap tiles) by Skia**, and the compositor then texture-maps that bitmap through the 3D transform each frame [index](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count?hl=en).

Three consequences follow, each documented:

1. **Grayscale instead of subpixel antialiasing on baked layers.** ClearType-style subpixel (RGB) antialiasing assumes axis-aligned text on an opaque background. Once text is baked into a layer that may be rotated, the rasterizer falls back to grayscale AA. The observable symptom is the well-known "flash": text looks smoother *while* animating and snaps to a different (often jaggier or softer) rendering the moment the animation stops — demonstrated with Windows screenshots in [index](http://www.useragentman.com/blog/2014/05/04/fixing-typography-inside-of-2-d-css-transforms/). The effect is most pronounced on Windows at 100 % (non-HiDPI) scale, where subpixel AA otherwise does the most work.
2. **Bilinear resampling during the rotation.** While `rotateY` is in flight, the GPU stretches the baked bitmap; the settle frame can retain a soft raster if the layer is not re-rasterized at the final transform. Community reports consistently show the *final* frame staying blurry when a permanent promotion hint is left on [index](https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811).
3. **Permanent promotion is the worst case.** A 2026-09-07 Chromium/Edge-on-Windows-11 case documents that a *permanently* `will-change: transform`-promoted layer holding small (7–11 px), low-contrast text is "a well-documented source of blurry sub-pixel text rendering in Chromium on standard, non-HiDPI 100%-scale displays." Scoping the promotion to the interaction and adding `backface-visibility: hidden` was the applied remedy [index](https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811).

**Net rule for Nocturne:** the card faces must live on the normal (non-composited) paint path at rest, and may only be layer-promoted for the ~720 ms the flip is in flight.

### 1.2 Layer promotion: `will-change` / `translateZ(0)` — transient only

- web.dev's compositing guidance: animate only `transform` and `opacity`; promote animated elements with `will-change` or `translateZ(0)`; "avoid overusing promotion rules; layers require memory and management" and textures must be uploaded to the GPU [index](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count?hl=en).
- **Lifecycle (normative for this feature):** add `will-change: transform` at flip *start*, remove it (`will-change: auto`) on `transitionend`/`transitioncancel` [index](https://github.com/aurorahijabco/webapp-campaign/blob/HEAD/.claude/skills/frontend/frontend-perf/frontend-perf-animation-gpu-containment/references/anti-patterns.md) [index](https://github.com/hipstersmoothie/standard-reader/blob/HEAD/.claude/skills/ui-animation/references/performance-deep-dive.md). Never declare it statically in the stylesheet for the card.
- Cost model: each composited layer costs roughly `width × height × 4` bytes of GPU memory; a 380×380 card ≈ 0.6 MB — trivial for one card, which is why transient promotion of exactly one element is safe, but permanent promotion of many elements is a "GPU memory bomb" [index](https://github.com/snoodleboot-io/discrecontinual_equations/blob/HEAD/.claude/skills/css-performance-optimization/SKILL.md).
- MDN `will-change`: "Don't apply will-change to too many elements… It causes significant resource consumption and bad performance" (quoted verbatim in [index](https://github.com/aurorahijabco/webapp-campaign/blob/HEAD/.claude/skills/frontend/frontend-perf/frontend-perf-animation-gpu-containment/references/anti-patterns.md), citing https://developer.mozilla.org/en-US/docs/Web/CSS/will-change).

### 1.3 Settle-state flattening (the definitive crisp-at-rest technique)

**Recommended technique (rank #1, §1.7): full settle-swap.** On `transitionend` for the `transform` property, replace the 3D end-state with its pixel-identical 2D equivalent so the resting face returns to the standard paint path (with subpixel AA) instead of lingering as a GPU-baked layer:

- *During flight:* `.flip-inner { transform-style: preserve-3d; transform: rotateY(0→180deg); will-change: transform; }`, faces carry `backface-visibility: hidden`, back face pre-rotated `rotateY(180deg)`.
- *At settle (`flipped`):* add `.is-settled` → inner becomes `transform-style: flat; transform: none; will-change: auto;`, front face `visibility: hidden`, back face `transform: none`. The back face is now a plain, untransformed, non-composited block — Chromium paints its text through the normal pipeline.
- *Flip-back:* remove `.is-settled` first (restores `preserve-3d` + the 180° transforms), force a reflow, then animate `rotateY(180deg → 0)` in the next frame. Because the visual at the swap instant is identical (back face fully frontal), the swap itself is invisible; the only perceptible change is text *sharpening* as it leaves the GPU raster path.

**Simpler alternative (rank #2):** keep `preserve-3d` + `rotateY(180deg)` at rest but drop `will-change` on `transitionend`. Evidence from the foxly-it case shows removing the permanent promotion alone resolved resting blur on real hardware [index](https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811). Choose the full settle-swap if liner-notes text must be pixel-perfect (it is the product's signature surface); choose the simpler variant if code size is prioritized. Both are implemented in §5 (the snippet defaults to the full swap).

**Why this works (mechanism, honest scope):** removing every compositing trigger (`will-change`, 3D `transform`, `preserve-3d`) returns the element to Blink's ordinary paint path, where text is rasterized per-frame-aligned with subpixel AA rather than from a baked GPU texture. That the resting face becomes crisp again after demotion is documented in the fixed case above; the *exact internal re-raster timing* in current Chromium is `[unverified]` — see final section.

**Guard:** `transitionend` does not fire if the transition is aborted (e.g. `display: none` mid-flight, or the animating property's value is changed) [index](https://github.com/josh-cena/mdn-content/blob/HEAD/files/en-us/web/api/element/transitioncancel_event/index.md). Always pair the `transitionend` listener with `transitioncancel` and a `setTimeout` fallback of `duration + 100 ms` (cleared on success) so the card can never be stranded promoted.

### 1.4 `backface-visibility` implications

- It **must be set on the individual faces** (`.flip-face`), not on the rotating wrapper. On the wrapper it would hide the entire card when turned away; on the faces it selectively culls the far side [index](https://github.com/takazudo/zudo-css-wisdom/blob/HEAD/src/content/docs/effects/css-3d-transforms.mdx).
- It doubles as a GPU-promotion hint in Blink/WebKit ("just another way of throwing rendering of a DOM element to the GPU") and is the standard companion remedy for sharpening text inside 3D-transformed elements [index](http://www.useragentman.com/blog/2014/05/04/fixing-typography-inside-of-2-d-css-transforms/) [index](https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811).
- During flight it prevents the mirrored-text artifact at 90°+: at exactly edge-on both faces have zero projected width; past 90°, the far face is culled instead of showing reversed text. This is what eliminates the "midway pop."

### 1.5 Why `filter` (or any grouping property) on the 3D ancestors breaks everything

CSS Transforms Level 2 §7.1 ("Grouping property values") is normative here: the following force the **used value** of `transform-style` to `flat` even when `preserve-3d` is specified — `overflow` other than `visible`/`clip`, `opacity` < 1, **`filter` other than `none`**, `clip-path` other than `none`, `mask-image` other than `none`, `mix-blend-mode` other than `normal`, `isolation: isolate`, and paint containment [index](https://www.w3.org/TR/css-transforms-2/) [index](https://Developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style).

Practical consequences for the card:

- **No `filter`, no `overflow: hidden`, no `opacity < 1`, no `mix-blend-mode`, no `isolation: isolate` on `.flip-scene` or `.flip-inner`.** Any of them silently flattens the 3D context: both faces render coplanar and overlapped. (The `overflow: hidden` trap is called out explicitly in [index](https://github.com/takazudo/zudo-css-wisdom/blob/HEAD/src/content/docs/effects/css-3d-transforms.mdx).) If the tracklist needs clipping, clip the *scroll container inside the back face*, never the 3D ancestors.
- **No animated `filter: blur()` / `drop-shadow()` anywhere near the flip.** In Chromium's compositor, `filter` animations bail to the main thread when the filter "moves pixels" — `blur()` and `drop-shadow()` are **not** composited (only color-matrix filters like `brightness()`/`saturate()` are), per the `kCompositableProperties` / `HasFilterThatMovesPixels()` logic in `third_party/blink/renderer/core/animation/compositor_animations.cc` [index](https://github.com/fsu-ml/fsu-ml.github.io/blob/HEAD/.claude/skills/website-audit/references/animation-and-motion.md). The grain overlay therefore uses `opacity` only (§3.2), and the card's shadow is a static `box-shadow` on an outer wrapper (pre-rasterized once, never animated).
- Corollary: the corner-peel affordance's shadow must not use `filter: drop-shadow()` on the animated card. Put any `drop-shadow` on a static outer wrapper, or use `box-shadow` on the rectangular faces.

### 1.6 Supersampling tricks — and why they rank last

The known trick: render text at 2× (`transform: scale(2)` on an inner wrapper) inside a 0.5×-scaled parent, so the baked texture holds more texels. Costs: **4× GPU texture memory** for the layer, and it does *not* restore subpixel AA (the raster is still grayscale-AA'd, just denser). Chromium already rasterizes composited layers at `deviceScaleFactor × ideal transform scale`, so on HiDPI displays you get supersampling for free; on 1× displays the trick trades memory for a marginal sharpness gain while keeping the grayscale-AA look. **Verdict: do not use.** The settle-swap (§1.3) achieves genuinely crisp text at zero memory cost.

### 1.7 Technique reliability ranking (Chromium 2024–2026, WebView2)

| Rank | Technique | Reliability | Basis |
|---|---|---|---|
| 1 | **Settle-swap**: drop `will-change` + `preserve-3d` + baked `rotateY` on `transitionend`; resting face = plain 2D block | Highest — resting text on the normal paint path by construction | Blink layer-assignment rules; fixed-case evidence [index](https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811) |
| 2 | Transient `will-change: transform` only during flight; remove on `transitionend`/`transitioncancel` | High — directly resolved real-world resting blur | Same case; web.dev guidance [index](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count?hl=en) |
| 3 | `backface-visibility: hidden` on both faces | High — required for correct culling; promotion side-effect sharpens mid-flight | [index](http://www.useragentman.com/blog/2014/05/04/fixing-typography-inside-of-2-d-css-transforms/) |
| 4 | Zero grouping properties on 3D ancestors (`filter: none`, `overflow: visible`, `opacity: 1`, …) | Spec-guaranteed — violations *silently* flatten | Normative: [index](https://www.w3.org/TR/css-transforms-2/) |
| 5 | Resting geometry on exact `rotateY(0deg/180deg)`; integer-pixel card size; snap `transitionend` to integer | Medium — avoids subpixel-misalignment softness | Community practice [index](https://dev.to/aleksandra_lando_/fixing-blurry-text-when-stopping-css-transform-animations-the-data-attribute-hack-50a5) |
| 6 | Keep animated-face text ≥ 11 px; avoid hairline weights at small sizes on the GPU path | Medium — small/low-contrast text is where baked-layer blur is most visible | Empirical case [index](https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811) |
| 7 | Supersampling (render 2×, scale down) | Low — 4× memory, still grayscale AA | Mechanism analysis; not recommended |

---

## 2. 3D Spring Physics & Fluid Flip Kinematics

### 2.1 Spring curves: CSS `linear()` spring emulation with `cubic-bezier` fallback

A single `cubic-bezier` cannot express overshoot-then-settle (it is confined to a monotonic mapping in the unit box for the y-values commonly used… more precisely, y-values outside [0,1] *can* overshoot, e.g. `cubic-bezier(.34,1.56,.64,1)`, but only with one extremum and no secondary wobble). The modern primitive is the CSS **`linear()` easing function** (CSS Easing Functions Level 2): a list of progress stops, linearly interpolated, whose values may exceed 1 (overshoot) or dip below 0 (undershoot) [index](https://github.com/ccheney/robust-skills/blob/HEAD/skills/modern-css/references/ANIMATION.md).

**Support is safe for WebView2:** `linear()` is Baseline since 2023-12-11 — Chrome/Edge 113+ (May 2023), Firefox 112+, Safari 17.2+ [index](https://github.com/sapegin/dotfiles/blob/HEAD/ai/skills/_references/modern-web-guidance/user-experience/physics-based-easing.md). WebView2's evergreen runtime ships Chromium ≥ 115. MDN documents the authoring pattern [index](https://developer.mozilla.org/en-US/blog/custom-easing-in-css-with-linear/?ref=sidebar).

**Recommended flip spring** (low-overshoot, `stiffness ≈ 300 / damping ≈ 22` family — peak 1.064, i.e. the card rotates to ≈ 191.5° then settles back to 180°; a tactile "weight" without nausea), stored as a CSS custom property [index](https://github.com/ccheney/robust-skills/blob/HEAD/skills/modern-css/references/ANIMATION.md):

```css
:root {
  --ease-flip-spring: linear(0, 0.009, 0.035, 0.078, 0.141, 0.223, 0.326,
    0.45, 0.594, 0.758, 0.938, 1.026, 1.063, 1.064, 1.042, 1.007,
    0.968, 0.938, 0.923, 0.925, 0.942, 0.966, 0.99, 1.006, 1.012,
    1.008, 0.998, 0.99, 0.988, 0.992, 0.998, 1.002, 1.003, 1.001, 1);
}
```

**Fallback** for engines without `linear()` (declared first; `@supports` overrides — browsers ignore declarations they don't parse [index](https://developer.mozilla.org/en-US/blog/custom-easing-in-css-with-linear/?ref=sidebar)):

```css
.flip-inner {
  transition: transform 720ms cubic-bezier(0.3, 1.25, 0.4, 1); /* mild single overshoot */
}
@supports (transition-timing-function: linear(0, 1)) {
  .flip-inner { transition-timing-function: var(--ease-flip-spring); }
}
```

> **Do NOT use the "bouncy" presets** floating around for this rotation. E.g. the googlechrome modern-web-guidance spring sample peaks at **1.585** [index](https://github.com/googlechrome/modern-web-guidance-src/blob/HEAD/guides/ui-behaviors/physics-based-easing/guide.md) — applied to 180° that would whip the card to ~285°. Rotation springs must be critically-damped-ish; reserve high overshoot for scale/translate micro-interactions. Generators such as `springline` (zero-dependency, build-time: `spring({ stiffness: 300, damping: 22 })` → `{ easing, duration }` string; "the animation runs on the compositor like any other CSS transition" [index](https://github.com/danilaa1/springline)) can regenerate the curve if the feel needs tuning — nothing ships to the client.

**Why springs avoid the 90° edge-snap:** `ease-in-out` has minimum velocity at 50 % progress — exactly where the card is edge-on (90°) — so the flip visibly "sticks" at its thinnest, then pops. A spring's velocity is *maximal* near mid-travel, so the card punches through 90° and decelerates into the settle; combined with correct `backface-visibility` culling (§1.4), there is no midway pop. `linear()` "does not calculate duration automatically — always include a duration" [index](https://github.com/googlechrome/modern-web-guidance-src/blob/HEAD/guides/ui-behaviors/physics-based-easing/guide.md).

### 2.2 Duration ranges & justification

| Gesture | Duration | Rationale |
|---|---|---|
| Flip (front→back) | **720 ms** | NN/g response-time limits: 0.1 s feels instantaneous, **1.0 s keeps the flow of thought uninterrupted** [index](https://github.com/semikolon/spela/blob/HEAD/docs/ux_principles_media_remote_2026_07_04.md). A 180° flip at 720 ms (42 frames @60 fps — enough samples for the 34-stop `linear()` curve) sits inside the flow band while giving the spring room for its overshoot-and-settle tail. Below ~600 ms the spring reads as a snap; above ~900 ms repeated `F`-presses feel sluggish. |
| Flip-back | **480 ms** | Returning is a dismissal, not a reveal — faster reads as responsive. (Also shortens the perceived cost of accidental flips.) |
| Corner-peel hover | 220 ms `ease-out` | Micro-affordance; must feel attached to the pointer. |
| Reduced-motion swap | **160 ms** opacity crossfade | Replaces rotation with a fade (MDN: replace motion, don't just delete feedback) [index](https://developer.Mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) |

The flip animates **only `transform`** on one element — a true compositor-only animation (cf. Chromium's `kCompositableProperties`: `transform` → `cc::TargetProperty::TRANSFORM` [index](https://github.com/fsu-ml/fsu-ml.github.io/blob/HEAD/.claude/skills/website-audit/references/animation-and-motion.md)) — so 60 fps is a budget formality, not a risk, provided no layout/paint properties are touched mid-flight.

### 2.3 Flippability affordances

Three redundant signals (tactile, persistent, keyboard), all pure CSS + one `<button>`:

1. **Tactile corner affordance (primary).** A real `<button>` pinned to the card's top-right corner, rendered as a folded page corner: a right-triangle formed by a `linear-gradient(135deg, transparent 50%, <amber-dark> 50%)` on a 44×44 px hit area, with `aria-label="Show liner notes (F)"`. On hover/focus-visible the fold *lifts*: `transform: rotateX(-18deg) translateZ(6px)` + a soft `box-shadow`, 220 ms `ease-out` — a micro page-curl that reads as "peel me." The fold-lift pattern (dog-ear via `clip-path` + rotate about an edge + shadow for depth) is documented in [index](https://github.com/shuvam-banerji-seal/sac_website/blob/HEAD/docs/clip-path-paper-folds.md). Implementation in §5.4 keeps `filter` off the animated card (shadow via `box-shadow` on the static corner element).
2. **Persistent micro-badge.** Bottom-right of the card, an 8 px-radius chip: `⟲ LINER NOTES` + `<kbd>F</kbd>`, amber-on-obsidian at 60 % opacity, `pointer-events: none`. Fades out permanently after the first successful flip (localStorage flag `nocturne:flip-discovered`) — progressive disclosure, not permanent chrome.
3. **Keyboard hint.** The `F` shortcut is listed in the app's shortcut overlay; the corner button's tooltip shows `Show liner notes (F)`.

### 2.4 Flip-back triggers & `prefers-reduced-motion`

- **Flip-back triggers (all equivalent):** click anywhere on the back face · `Esc` · `F` again · the corner button (its label/icon toggles to "return"). `Esc`-to-dismiss matches the platform convention for dismissing overlays [index](https://github.com/ericmoin/oh-my-role/blob/HEAD/roles/react-frontend/skills/accessibility/SKILL.md); the react-flipcard reference implementation likewise wires `Escape` → show front [index](https://github.com/mzabriskie/react-flipcard).
- **`prefers-reduced-motion: reduce`** (MDN: the media feature "used to detect if the user has enabled a setting on their device to minimize the amount of non-essential motion"; vestibular triggers include large-object rotation [index](https://developer.Mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)):
  ```css
  @media (prefers-reduced-motion: reduce) {
    .flip-inner { transition: opacity 160ms ease-out; transform: none !important; }
    /* JS mirrors this: instant side swap, no 3D classes */
  }
  ```
  A 180° card rotation is exactly the class of large-object motion the query exists for. **Replace with a 160 ms opacity crossfade — never just `transition: none`** (which would make the state change invisible and disorienting). The React hook (`usePrefersReducedMotion`, §5.3) gates the 3D class path so `transitionend`-based settle logic is bypassed consistently. Also honor it for the corner-peel lift and grain shimmer (grain stays static regardless — §3.2).

---

## 3. Back-Face "Liner Notes" Design Architecture & Content Model

### 3.1 Layout spec (card `w-[360px]`, `aspect-square` → 360 × 360 px)

The back face is a flex column with three zones. All type sizes chosen ≥ 10 px body / ≥ 11 px for the tracklist, per the small-text blur finding in §1.6.

```
┌──────────────────────────────────────┐
│ NOCTURNE ARCHIVE · LN-1973-042   [Amber 9px mono, tracking widest]
│ Kind of Blue                         [Serif 20px, #F5F1E8]
│ Miles Davis · Columbia · 1959        [12px, zinc-400]
│ ── hairline rgba(234,179,8,.18) ──   │
│  01  So What                    9:22 │  ← scroll region (role=region,
│  02  Freddie Freeloader         9:46 │     tabindex=0, custom scrollbar)
│  03  Blue in Green              5:37 │
│  …                                   │
│ ── hairline ──                       │
│ FLAC · 44.1kHz · 16-BIT · 212 MB     [Mono 10px amber-dim, "STUDIO SPECS"]
└──────────────────────────────────────┘
```

| Zone | Spec |
|---|---|
| **Header** (padding 20 px, ~86 px tall) | Eyebrow: catalog no. mono 9 px uppercase `tracking-[0.22em]` amber `#EAB308`. Title: serif 20 px/1.2, warm paper `#F5F1E8`. Subline: 12 px `#A1A1AA` — `{artist} · {label} · {year}`. Bottom: 1 px hairline `rgba(234,179,8,0.18)` with 24 px margins. |
| **Tracklist** (`flex-1`, `overflow-y: auto`) | Rows: 34 px tall, grid `28px 1fr auto`. №: mono 11 px `text-amber-200/50` `tabular-nums`. Title: 12.5 px `#E7E5DF`, truncate. Duration: mono 11 px `text-zinc-400` `tabular-nums`. Row separators: `rgba(255,255,255,0.04)`. Hover: `bg-white/[0.03]`. Custom scrollbar: 6 px, thumb `rgba(234,179,8,0.25)`. `role="region"`, `aria-label="{Album} tracklist"`, `tabindex={0}` so keyboard users can scroll it. Empty state: "No tracks indexed for this album." |
| **Footer "Studio Specs Strip"** (~58 px) | Label `STUDIO SPECS` mono 9 px amber tracking-widest; values row mono 10.5 px `text-zinc-300`: `FLAC · 44.1 kHz · 16-BIT · 320 kbps · 212.4 MB`. Values come from the DB row (codec/bitrate/sampleRate/bitDepth/fileSize), formatted by a pure function. |

**Content model (SQLite → props):** the component receives data; it never queries. Contract:

```ts
interface LinerNotes {
  albumTitle: string; artist: string; label: string; releaseYear: number;
  catalogNo: string; // e.g. "LN-1973-042"
  tracks: { no: number; title: string; durationSec: number }[];
  specs: { codec: string; bitrateKbps: number | null; sampleRateHz: number;
           bitDepth: number; fileSizeBytes: number };
}
/* Rust/Tauri side: SELECT no, title, duration_sec FROM tracks WHERE album = ? ORDER BY no;
   plus the album row for header/specs. Exposed via invoke('get_liner_notes', { album }). */
```

### 3.2 Vintage sleeve visual language — pure CSS, zero assets

- **Base:** `#0D0F15` matte. Layered gradients for depth without filters: `radial-gradient(120% 90% at 50% 0%, rgba(234,179,8,0.05), transparent 60%)` over the base.
- **Paper grain (static):** `::after` overlay with an SVG `feTurbulence` data-URI — the canonical recipe is `type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'` (fractalNoise = film grain; `turbulence` = clouds — a different material) [index](https://github.com/t1mdurden/prd-pipeline/blob/HEAD/plugins/superdesign/skills/superdesign/references/cookbook/texture.md), desaturated via `<feColorMatrix type='saturate' values='0'/>`, at **opacity 0.04–0.08, never higher** [index](https://github.com/deepception/cc_tool/blob/HEAD/templates/skills/design-director/references/aesthetic-organic-tactile.md). Applied as `position:absolute; inset:0; pointer-events:none` with `isolation: isolate` on the face so it stacks above the background but below content [index](https://github.com/3x-haust/oh-my-design/blob/HEAD/core/graphics/noise-grain-texture.md). **The grain must never animate** — shifting noise reads as a digital scanline artifact, not paper [index](https://github.com/deepception/cc_tool/blob/HEAD/templates/skills/design-director/references/aesthetic-organic-tactile.md). Because it is `opacity`-only (no `filter`), it stays compositor-friendly.
- **Amber accents:** hairlines, the eyebrow, the specs label, the active track row marker (`▶` in `#EAB308`).
- **Typography:** serif display (`Georgia, 'Times New Roman', serif` — system stack, no webfont download, no FOUT) for the album title; `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` for catalog/specs/durations; system sans for track titles. This serif-vs-mono contrast *is* the archive-box language.
- **Corner radius symmetry:** both faces share `border-radius: 18px` (≈ superellipse feel at this size) with an inner hairline `box-shadow: inset 0 0 0 1px rgba(234,179,8,0.14)` so front and back read as the same physical card stock. (Mismatched radii on 3D elements are also a known GPU-memory hazard — keep them uniform [index](https://github.com/jovidecroock/skills/blob/HEAD/web-performance-patterns/references/rendering.md).)

### 3.3 Accessibility

- The flip is driven by a real `<button>` (the corner affordance) with `aria-pressed={flipped}` and a dynamic `aria-label` ("Show liner notes (F)" / "Show album art (Esc)"). The whole card is **not** a button — the back face contains a scrollable region and must not be nested-interactive.
- **Focus management** (dialog-pattern adapted [index](https://github.com/ericmoin/oh-my-role/blob/HEAD/roles/react-frontend/skills/accessibility/SKILL.md)): on flip completion, move focus to the back-face heading (`tabIndex={-1}`, `id="liner-notes-title"`); on flip-back, restore focus to the corner button. Announce via an `aria-live="polite"` region: "Liner notes shown" / "Album art shown". (Precedent: flip-on-complete focusing the back control [index](https://github.com/mzabriskie/react-flipcard).)
- **Keyboard:** `F` toggles, `Esc` returns (ignored while focus is in `input/textarea/[contenteditable]` or with modifiers held). Focus ring via `focus-visible:` only — never strip the outline [index](https://github.com/ericmoin/oh-my-role/blob/HEAD/roles/react-frontend/skills/accessibility/SKILL.md).
- **Reduced motion:** §2.4. **Contrast:** amber `#EAB308` on `#0D0F15` ≈ 9.5:1 — AAA for the eyebrow/specs; body `#E7E5DF` on obsidian ≈ 15:1.

---

## 4. State Coexistence & Stage Invariants

### 4.1 Interaction matrix

|  | Lyrics overlay opens (art → left third) | TiltCard mouse parallax | Track skip (next/prev) |
|---|---|---|---|
| **idle (front)** | Card translates left with the stage group; flip stays available. Tilt **frozen** while lyrics open (parallax would fight the left-third composition and adds a layer during a layout transition). | Active on front: `rotateX/Y ±7°`, springy `120ms ease-out` follow. | Same album → nothing. New album → crossfade art, flip state untouched (already front). |
| **flipping** | **Locked out**: lyrics toggle is ignored until `transitionend` (or queues). Rationale: two simultaneous 3D/layout motions on one card = jank + state ambiguity. | **Paused**: `tiltSuspended=true` at flip start; tilt transform is on the *scene* wrapper (outer), flip on the *inner* — pausing avoids transform fighting. Resume on settle. | Skip **cancels** the flip: set side to front (reverses from the current angle via the transition's natural reversal), then crossfades. |
| **flipped (back)** | Allowed: liner notes remain readable in the left-third slot; tracklist scroll unaffected. | **Adapted**: tilt stays live but *inverted X response* (the card is mirror-rotated 180°, so un-inverted tilt would feel detached from the cursor) and reduced to ±3.5° to protect text legibility. | Same album → **preserve** flipped (notes are album-scoped; yanking them away on every skip is hostile). New album → animate flip-back *concurrent* with the art crossfade (480 ms), then swap content under the settled front. |
| **flipping-back** | Same lockout as flipping. | Paused until settle. | Same as flipping. |

**Structural invariant:** tilt applies to `.flip-scene` (outer), flip applies to `.flip-inner`, lyrics shift applies to the stage group above both. Three nested elements, one transform each — they compose without fighting, and each can be paused independently.

### 4.2 State machine & store placement

```
idle ──requestFlip(back)──▶ flipping ──transitionend──▶ flipped
  ▲                           │                              │
  │                     F/Esc/click = reverse from        requestFlip(front)
  │                      current angle (CSS transition     or Esc/F/click
  │                      auto-reverses)                        │
  └────────────── flipping-back ◀── transitioncancel/timeout ─┘
                        │  transitionend
                        ▼
                       idle
```

- **Where it lives: Zustand slice** (`useStageStore`, §5.2). Rationale: `flipSide`/`flipPhase` are read by three components (card, lyrics overlay, tilt controller) and drive cross-cutting invariants (tilt suspension, lyrics lockout). Local `useState` would force prop-drilling through the stage tree; a full `useReducer`+context re-renders more broadly than Zustand's selectors. The *transient* DOM flags (`.is-settled` class, timeouts) stay in refs inside the card component — the store holds only the semantic state. (Zustand pattern: typed `create<T>()(...)` curried form [index](https://github.com/pmndrs/zustand/blob/HEAD/docs/learn/guides/beginner-typescript.md).)
- **Interruptibility (F spam):** requesting the opposite side mid-flight simply flips the target class. CSS transitions reverse from the *currently rendered* value automatically, so no angle bookkeeping is needed. The store moves `flipping → flipping-back` (or vice versa) immediately; `transitionend` (which fires for the reversed transition) settles it. The `transitioncancel` + timeout fallback (§1.3) guarantees the machine can never wedge in a `flipping*` phase.
- **Reduced-motion path bypasses the machine:** with `prefers-reduced-motion`, `requestFlip` sets the side instantly (160 ms crossfade, no 3D classes, no `transitionend` dependency).

---

## 5. Complete Implementation Blueprint & Code Snippets

Conventions: Tailwind v4 utilities for layout/typography (`perspective-[1200px]`, `transform-3d`, `backface-hidden` exist as v4-native 3D utilities [index](https://github.com/impertio-studio/tailwindcss-claude-skill-package/blob/HEAD/skills/source/tailwind-syntax/tailwind-syntax-3d-transforms/SKILL.md)); the **animation-critical mechanics** (rotateY variable, spring timing, settle-swap, corner peel, grain) are pinned in `flip.css` so behavior never depends on Tailwind's transform-variable composition.

### 5.1 `src/components/stage/flip.css` — zero-blur 3D core, spring, affordances

```css
/* ---- Spring: low-overshoot linear() emulation + cubic-bezier fallback ---- */
:root {
  --ease-flip-spring: linear(0, 0.009, 0.035, 0.078, 0.141, 0.223, 0.326,
    0.45, 0.594, 0.758, 0.938, 1.026, 1.063, 1.064, 1.042, 1.007,
    0.968, 0.938, 0.923, 0.925, 0.942, 0.966, 0.99, 1.006, 1.012,
    1.008, 0.998, 0.99, 0.988, 0.992, 0.998, 1.002, 1.003, 1.001, 1);
  --flip-duration: 720ms;
  --flipback-duration: 480ms;
}

/* ---- 3D scene: perspective lives HERE (parent), never on the faces ---- */
.flip-scene {
  perspective: 1200px;               /* ≈3.3× card width: depth without distortion */
  perspective-origin: 50% 50%;
}

/* ---- Inner rotor: the ONLY element that animates transform ---- */
.flip-inner {
  position: relative;
  width: 100%; height: 100%;
  transform-style: preserve-3d;
  transform: rotateY(var(--flip-angle, 0deg));
  /* cubic-bezier fallback declared first; linear() wins where supported */
  transition: transform var(--flip-duration) cubic-bezier(0.3, 1.25, 0.4, 1);
  will-change: auto;                 /* promoted transiently via .is-live only */
}
@supports (transition-timing-function: linear(0, 1)) {
  .flip-inner { transition-timing-function: var(--ease-flip-spring); }
}
.flip-inner.is-flipping-back { transition-duration: var(--flipback-duration); }
.flip-inner.is-live { will-change: transform; }   /* added at flip start, removed at settle */

/* ---- Settle-swap: pixel-identical 2D end-state, zero GPU layer at rest ---- */
.flip-inner.is-settled {
  transform-style: flat;
  transform: none;
  transition: none;
  will-change: auto;
}
.flip-inner.is-settled .flip-face--front { visibility: hidden; }
.flip-inner.is-settled .flip-face--back  { transform: none; }

/* ---- Faces ---- */
.flip-face {
  position: absolute; inset: 0;
  backface-visibility: hidden;      /* on the FACES, never the wrapper (§1.4) */
  -webkit-backface-visibility: hidden;
  border-radius: 18px;
  overflow: hidden;                  /* safe: faces are leaves, not the 3D context */
}
.flip-face--back { transform: rotateY(180deg); }

/* grouping-property quarantine: nothing on .flip-scene/.flip-inner may ever be
   filter/opacity<1/overflow!=visible/mix-blend-mode/isolation (§1.5) */

/* ---- Vintage grain: static, opacity-only, no filter ---- */
.flip-face--back::after {
  content: ""; position: absolute; inset: 0; z-index: 1;
  pointer-events: none; opacity: 0.06;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 240px 240px;
}
.flip-face--back { isolation: isolate; }
.flip-face--back > * { position: relative; z-index: 2; }  /* content above grain */

/* ---- Corner-peel affordance (real <button>, §2.3) ---- */
.corner-peel {
  position: absolute; top: 0; right: 0; z-index: 3;
  width: 52px; height: 52px; cursor: pointer;
  background: linear-gradient(135deg, transparent 50%, #1a1d26 50%);
  border: 0; padding: 0;
  border-top-right-radius: 18px;
  clip-path: polygon(0 0, 100% 0, 100% 100%);   /* right-triangle fold */
  transition: transform 220ms ease-out, filter 220ms ease-out;
  transform-origin: top right;
}
.corner-peel::before {  /* amber glint on the fold */
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(135deg, transparent 50%, rgba(234,179,8,0.55) 50%);
  opacity: 0; transition: opacity 220ms ease-out;
}
.corner-peel:hover::before, .corner-peel:focus-visible::before { opacity: 1; }
.corner-peel:hover, .corner-peel:focus-visible {
  transform: rotateX(-16deg) translateZ(8px);   /* the lift */
  box-shadow: -6px 6px 14px rgba(0,0,0,0.45);    /* box-shadow: rect is fine here */
}
.corner-peel .kbd-hint {
  position: absolute; bottom: 4px; left: 8px;
  font: 600 10px/1 ui-monospace, monospace; color: #0D0F15;
  background: #EAB308; border-radius: 4px; padding: 2px 5px;
}

/* ---- Reduced motion: crossfade replaces rotation ---- */
@media (prefers-reduced-motion: reduce) {
  .flip-inner { transition: opacity 160ms ease-out; transform: none !important; }
  .flip-inner.is-flipped-rm .flip-face--front { opacity: 0; }
  .flip-inner.is-flipped-rm .flip-face--back  { opacity: 1; transform: none; }
  .flip-face--back { opacity: 0; transition: opacity 160ms ease-out; }
  .corner-peel:hover, .corner-peel:focus-visible { transform: none; }
}
```

### 5.2 `src/stores/useStageStore.ts` — Zustand slice

```ts
import { create } from 'zustand';

export type FlipSide = 'front' | 'back';
export type FlipPhase = 'idle' | 'flipping' | 'flipping-back';

interface StageState {
  flipSide: FlipSide;
  flipPhase: FlipPhase;
  lyricsOpen: boolean;
  flipDiscovered: boolean;
  /** Request a side. Lockout: ignored while flipping* if lyrics animating (handled by caller). */
  requestFlip: (side: FlipSide) => void;
  setFlipPhase: (p: FlipPhase) => void;
  setLyricsOpen: (open: boolean) => void;
  markFlipDiscovered: () => void;
  /** Track skip: same album keeps side; new album resets to front. */
  handleAlbumChange: (sameAlbum: boolean) => void;
}

export const useStageStore = create<StageState>()((set, get) => ({
  flipSide: 'front',
  flipPhase: 'idle',
  lyricsOpen: false,
  flipDiscovered: false,

  requestFlip: (side) => {
    const { flipSide, flipPhase } = get();
    if (side === flipSide && flipPhase !== 'flipping' && flipPhase !== 'flipping-back') return;
    // Interrupt: reversing mid-flight is legal; CSS transition auto-reverses from current angle.
    set({
      flipSide: side,
      flipPhase: side === 'back' ? 'flipping' : 'flipping-back',
    });
  },
  setFlipPhase: (flipPhase) => set({ flipPhase }),
  setLyricsOpen: (lyricsOpen) => set({ lyricsOpen }),
  markFlipDiscovered: () => set({ flipDiscovered: true }),
  handleAlbumChange: (sameAlbum) =>
    set((s) => (sameAlbum ? s : { flipSide: 'front', flipPhase: s.flipSide === 'back' ? 'flipping-back' : 'idle' })),
}));
```

### 5.3 `src/hooks/useFlipKeyboard.ts` + `usePrefersReducedMotion.ts`

```ts
import { useEffect, useState } from 'react';
import { useStageStore } from '../stores/useStageStore';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);   // cleanup, always
  }, []);
  return reduced;
}

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

/** Global F / Escape wiring. Mount once at the stage root. */
export function useFlipKeyboard() {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      const { flipSide, requestFlip } = useStageStore.getState();
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        requestFlip(flipSide === 'front' ? 'back' : 'front');
      } else if (e.key === 'Escape' && flipSide === 'back') {
        requestFlip('front');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);  // cleanup, always
  }, [reduced]);
}
```

### 5.4 `src/components/stage/LinerNotesCard.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { useStageStore } from '../../stores/useStageStore';
import { usePrefersReducedMotion } from '../../hooks/useFlipKeyboard';
import './flip.css';

export interface LinerNotes { /* §3.1 contract */ albumTitle: string; artist: string;
  label: string; releaseYear: number; catalogNo: string;
  tracks: { no: number; title: string; durationSec: number }[];
  specs: { codec: string; bitrateKbps: number | null; sampleRateHz: number;
           bitDepth: number; fileSizeBytes: number }; }

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtMB = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

export function LinerNotesCard({ notes, artUrl }: { notes: LinerNotes; artUrl: string }) {
  const flipSide = useStageStore((s) => s.flipSide);
  const flipPhase = useStageStore((s) => s.flipPhase);
  const flipDiscovered = useStageStore((s) => s.flipDiscovered);
  const reduced = usePrefersReducedMotion();
  const innerRef = useRef<HTMLDivElement>(null);
  const backTitleRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const settleTimer = useRef<number>(0);

  const flipped = flipSide === 'back';
  const inFlight = flipPhase === 'flipping' || flipPhase === 'flipping-back';

  /* Drive the 3D classes + transient promotion + settle-swap (§1.3) */
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || reduced) return;
    window.clearTimeout(settleTimer.current);

    if (inFlight) {
      inner.classList.remove('is-settled');
      inner.classList.add('is-live');                       // will-change: transform
      // Force reflow so the swap-off above is committed before the angle changes:
      void inner.offsetWidth;
      inner.style.setProperty('--flip-angle', flipped ? '180deg' : '0deg');
      inner.classList.toggle('is-flipping-back', flipPhase === 'flipping-back');
    }

    const onSettled = (ev: TransitionEvent) => {
      if (ev.propertyName !== 'transform') return;
      finishSettle();
    };
    const finishSettle = () => {
      inner.classList.remove('is-live');                   // drop promotion
      inner.classList.add('is-settled');                    // flatten to 2D end-state
      inner.style.removeProperty('--flip-angle');
      useStageStore.getState().setFlipPhase('idle');
      useStageStore.getState().markFlipDiscovered();
      // Focus management (§3.3)
      (flipped ? backTitleRef : triggerRef).current?.focus({ preventScroll: true });
    };
    inner.addEventListener('transitionend', onSettled);
    inner.addEventListener('transitioncancel', onSettled);
    // Fallback: transitionend never fires if the transition is aborted (§1.3)
    settleTimer.current = window.setTimeout(finishSettle, (flipped ? 720 : 480) + 120);

    return () => {
      inner.removeEventListener('transitionend', onSettled);
      inner.removeEventListener('transitioncancel', onSettled);
      window.clearTimeout(settleTimer.current);
    };
  }, [flipSide, flipPhase, inFlight, flipped, reduced]);

  const toggle = () =>
    useStageStore.getState().requestFlip(flipped ? 'front' : 'back');

  return (
    <div className="flip-scene relative h-[360px] w-[360px]" data-testid="liner-notes-card">
      <div
        ref={innerRef}
        className={`flip-inner${reduced && flipped ? ' is-flipped-rm' : ''}`}
        aria-live="polite"
      >
        {/* FRONT — album art */}
        <div className="flip-face flip-face--front bg-[#0D0F15]">
          <img src={artUrl} alt={`${notes.albumTitle} album art`}
               className="h-full w-full rounded-[18px] object-cover" draggable={false} />
          {/* tactile corner affordance */}
          <button ref={triggerRef} type="button" onClick={toggle}
                  className="corner-peel" aria-pressed={flipped}
                  aria-label={flipped ? 'Show album art (Esc)' : 'Show liner notes (F)'}>
            <span className="kbd-hint" aria-hidden="true">F</span>
          </button>
          {!flipDiscovered && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-[3] rounded-md bg-black/60 px-2 py-1 text-[10px] tracking-widest text-amber-200/80 backdrop-blur-none">
              ⟲ LINER NOTES
            </div>
          )}
        </div>

        {/* BACK — liner notes */}
        <div className="flip-face flip-face--back flex flex-col bg-[#0D0F15]
                        shadow-[inset_0_0_0_1px_rgba(234,179,8,0.14)]"
             onClick={toggle} role="button" tabIndex={0}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
             aria-label={`Liner notes for ${notes.albumTitle}. Activate to return to album art.`}>
          <header className="px-5 pb-3 pt-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#EAB308]">
              Nocturne Archive · {notes.catalogNo}
            </p>
            <h2 ref={backTitleRef} tabIndex={-1}
                className="mt-1 font-serif text-[20px] leading-tight text-[#F5F1E8] outline-none">
              {notes.albumTitle}
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              {notes.artist} · {notes.label} · {notes.releaseYear}
            </p>
            <div className="mx-1 mt-3 h-px bg-[rgba(234,179,8,0.18)]" />
          </header>

          <div role="region" aria-label={`${notes.albumTitle} tracklist`} tabIndex={0}
               className="mx-2 flex-1 overflow-y-auto px-3 focus-visible:outline-amber-500/60">
            {notes.tracks.length === 0 && (
              <p className="px-2 py-4 text-[12px] text-zinc-500">No tracks indexed for this album.</p>
            )}
            <ol>
              {notes.tracks.map((t) => (
                <li key={t.no}
                    className="grid h-[34px] grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-white/[0.04] px-2 hover:bg-white/[0.03]">
                  <span className="font-mono text-[11px] tabular-nums text-amber-200/50">
                    {String(t.no).padStart(2, '0')}
                  </span>
                  <span className="truncate text-[12.5px] text-[#E7E5DF]">{t.title}</span>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                    {fmtDur(t.durationSec)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <footer className="px-5 pb-4 pt-2">
            <div className="mb-1 h-px bg-[rgba(234,179,8,0.18)]" />
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#EAB308]/80">
              Studio Specs
            </p>
            <p className="mt-1 font-mono text-[10.5px] text-zinc-300">
              {notes.specs.codec}
              {notes.specs.bitrateKbps ? ` · ${notes.specs.bitrateKbps} kbps` : ''}
              {` · ${(notes.specs.sampleRateHz / 1000).toFixed(1)} kHz · ${notes.specs.bitDepth}-BIT · ${fmtMB(notes.specs.fileSizeBytes)}`}
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
```

**Notes on the snippet (normative):**

- The `void inner.offsetWidth` reflow between removing `.is-settled` and setting `--flip-angle` is load-bearing: without it, the browser may batch the class removal and the angle change into one style recalc and skip the transition (no `transitionend`, card stuck mid-state).
- `transition-property` is `transform` only; the `transitionend` handler filters on `ev.propertyName === 'transform'` so the opacity crossfade (reduced-motion path) never triggers settle logic.
- The back face is `role="button"` + keyboard-operable for flip-back, but the scrollable tracklist inside keeps its own `tabindex`/region semantics — nested-interactive is avoided because the region is scrolled, not activated.
- **Reduced-motion path:** no 3D classes at all; `.is-flipped-rm` crossfades faces via opacity. The store still records `flipSide` so `F`/`Esc`/lyrics/tilt invariants hold.
- **Tilt coexistence:** tilt transforms target `.flip-scene` (outer) via a separate rAF controller that reads `flipPhase`/`lyricsOpen` from the store and skips frames while `inFlight` or `lyricsOpen`; on the back face it inverts the X response and clamps to ±3.5° (§4.1).

### 5.5 Wiring checklist (stage root)

1. Mount `useFlipKeyboard()` once in the stage root.
2. On `handleAlbumChange(sameAlbum)` from the player: same album → no-op; new album → card flips back (480 ms) *then* swap `notes`/`artUrl` props at settle (subscribe to `flipPhase === 'idle'`), so content never swaps mid-rotation.
3. Lyrics overlay: `lyricsOpen` from the store; while `flipPhase !== 'idle'`, defer the toggle (queue one pending action) per §4.1.
4. Verify in DevTools **Layers** panel: at rest, the card must show **zero** dedicated compositor layers; during flight, exactly one. Verify in **Rendering → Paint flashing**: no paint during flight (transform-only), one repaint at settle.

---

## Unverified / Version-Dependent Notes

Honesty section — claims below could **not** be confirmed in a primary source (MDN, W3C spec, Chromium source/docs) during this session, or depend on Chromium/WebView2 version behavior. Do not treat them as guarantees; validate on the target WebView2 runtime before locking the architecture.

1. **Re-raster timing after `transitionend`.** That Chromium re-rasterizes a composited layer at the final transform (rather than reusing the in-flight bitmap) is inferred from community fix reports, not from a Chromium doc or source comment found in this session. The settle-swap (§1.3) is designed to be robust *regardless* of this timing, because it removes the layer entirely.
2. **Subpixel AA disabled on composited layers.** Empirically demonstrated (useragentman Windows screenshots, 2014; consistent with the 2026 foxly-it case), but no primary Chromium document stating the rule was located. Treat as strong empirical guidance, not spec.
3. **WebView2 ≈ desktop Chrome.** WebView2's evergreen runtime tracks Chromium releases, so `linear()` (Chrome 113+) and the compositing behaviors above are expected to hold; WebView2-specific deviations (e.g. GPU blocklists on older Windows 10 drivers forcing software compositing, where blur characteristics differ) were not tested here.
4. **Per-layer memory figures** ("width × height × 4 bytes", "4–8 MB per promoted layer") come from third-party performance guides, not Chromium docs; directionally correct, not exact.
5. **`filter` compositing carve-outs.** The `HasFilterThatMovesPixels()` analysis (blur/drop-shadow bail to main thread) cites Chromium `main` as of 2026 via a secondary source; exact behavior varies by version — regardless, the spec-level rule (§1.5: any non-`none` filter flattens `preserve-3d`) is normative and sufficient reason to keep filters off the 3D ancestors.
6. **Zero-frame pop on the settle-swap.** The swap is pixel-identical in geometry; a subtle one-frame text-rendering change (grayscale→subpixel AA) is *expected* — that is the sharpening. Its perceptibility was not measured; if it reads as a flicker on the target hardware, prefer the rank-#2 variant (keep `preserve-3d` at rest, drop only `will-change`).
7. **`@supports (transition-timing-function: linear(0, 1))`** as a feature query for the `linear()` *easing function* is the documented pattern (MDN blog); it detects parsing support, which is the correct gate.
8. **Tailwind v4 utility mapping** (`transform-3d`, `backface-hidden`, `perspective-*`) is confirmed via secondary v4 references; the blueprint deliberately pins animation-critical mechanics in `flip.css` so a Tailwind upgrade cannot silently change flip behavior.

---

## Sources

All sources are free public web sources, read 2026-09-26. `[index]` = read via web index this session.

**Primary / standards:**
- W3C CSS Transforms Module Level 2, §7.1 Grouping property values — https://www.w3.org/TR/css-transforms-2/ [index]
- MDN `transform-style` (grouping properties force used value `flat`) — https://Developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style [index]
- MDN blog: "Creating custom easing effects in CSS animations using the `linear()` function" — https://developer.mozilla.org/en-US/blog/custom-easing-in-css-with-linear/?ref=sidebar [index]
- MDN `prefers-reduced-motion` — https://developer.Mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion [index]
- MDN `will-change` — https://developer.mozilla.org/en-US/docs/Web/CSS/will-change (via quoting source) [index]
- MDN transition events semantics (via mdn-content mirror) — https://github.com/josh-cena/mdn-content/blob/HEAD/files/en-us/web/api/element/transitioncancel_event/index.md [index]
- web.dev: "Stick to Compositor-Only Properties and Manage Layer Count" — https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count?hl=en [index]

**Chromium behavior / case evidence:**
- useragentman: "Fixing Typography Inside of 2-D CSS Transforms" (GPU promotion, AA flash, `backface-visibility`/`perspective(1px)` fixes) — http://www.useragentman.com/blog/2014/05/04/fixing-typography-inside-of-2-d-css-transforms/ [index]
- foxly-it/rootguard commit 2026-09-07 (permanent `will-change` → blurry small text on Win11/Edge; scoping + `backface-visibility:hidden` remedy) — https://github.com/foxly-it/rootguard/commit/b15bec314ace40e8ea3f8b78788777db54484811 [index]
- Chromium `compositor_animations.cc` `kCompositableProperties` / `HasFilterThatMovesPixels()` analysis — https://github.com/fsu-ml/fsu-ml.github.io/blob/HEAD/.claude/skills/website-audit/references/animation-and-motion.md [index]
- CSS-Tricks forums: "Transforms cause font-smoothing weirdness in Webkit" — https://css-tricks.com/forums/topic/transforms-cause-font-smoothing-weirdness-in-webkit/ [index]
- dev.to: "Fixing Blurry Text When Stopping CSS Transform Animations (The Data Attribute Hack)" — https://dev.to/aleksandra_lando_/fixing-blurry-text-when-stopping-css-transform-animations-the-data-attribute-hack-50a5 [index]
- will-change lifecycle patterns — https://github.com/aurorahijabco/webapp-campaign/blob/HEAD/.claude/skills/frontend/frontend-perf/frontend-perf-animation-gpu-containment/references/anti-patterns.md [index]
- will-change lifecycle reference — https://github.com/aurorahijabco/webapp-campaign/blob/HEAD/.claude/skills/frontend/frontend-perf/frontend-perf-animation-gpu-containment/references/methods.md [index]
- Compositor layers & will-change discipline — https://github.com/hipstersmoothie/standard-reader/blob/HEAD/.claude/skills/ui-animation/references/performance-deep-dive.md [index]
- Layer memory cost model — https://github.com/snoodleboot-io/discrecontinual_equations/blob/HEAD/.claude/skills/css-performance-optimization/SKILL.md [index]
- Uniform border-radius / GPU memory — https://github.com/jovidecroock/skills/blob/HEAD/web-performance-patterns/references/rendering.md [index]

**Springs / `linear()` / durations:**
- googlechrome modern-web-guidance: physics-based easing with `linear()` — https://github.com/googlechrome/modern-web-guidance-src/blob/HEAD/guides/ui-behaviors/physics-based-easing/guide.md [index]
- `linear()` spring/bounce custom-property recipes + `@supports` + reduced-motion — https://github.com/ccheney/robust-skills/blob/HEAD/skills/modern-css/references/ANIMATION.md [index]
- `linear()` fallback strategies, Baseline 2023-12-11, Chrome 113+ — https://github.com/sapegin/dotfiles/blob/HEAD/ai/skills/_references/modern-web-guidance/user-experience/physics-based-easing.md [index]
- springline: build-time `linear()` spring generator (zero-dependency) — https://github.com/danilaa1/springline [index]
- NN/g 0.1 s / 1.0 s response-time limits — https://github.com/semikolon/spela/blob/HEAD/docs/ux_principles_media_remote_2026_07_04.md [index]

**Card-flip mechanics / affordances:**
- CSS 3D transforms: common mistakes (perspective placement, backface-visibility on faces, `overflow:hidden` vs `preserve-3d`) — https://github.com/takazudo/zudo-css-wisdom/blob/HEAD/src/content/docs/effects/css-3d-transforms.mdx [index]
- dev.to: 3D Flip Card Profile (HTML/CSS/JS) — https://dev.to/pasinducodes/3d-flip-card-profile-html-and-css-and-javascript-5180?url=https://dev.to/pasinducodes/3d-flip-card-profile-html-and-css-and-javascript-5180 [index]
- dev.to: 3D Flip Product Card CSS tutorial — https://dev.to/codingcss/3d-flip-product-card-css-tutorial-57n8 [index]
- dev.to: "How to make flip card with 5 lines CSS" — https://DEV.to/zougari47/how-to-make-flip-card-with-5-lines-css-m67 [index]
- Corner-peel / paper-fold via clip-path + edge rotation + drop-shadow — https://github.com/shuvam-banerji-seal/sac_website/blob/HEAD/docs/clip-path-paper-folds.md [index]
- react-flipcard: `onFlip` focus, `Escape` → front — https://github.com/mzabriskie/react-flipcard [index]

**Grain / vintage texture:**
- SVG `feTurbulence` paper-grain data-URI + `feColorMatrix` tinting — https://github.com/shuvam-banerji-seal/sac_website/blob/HEAD/docs/css-paper-texture-techniques.md [index]
- Grain as `::after` overlay, `isolation: isolate`, static-only — https://github.com/3x-haust/oh-my-design/blob/HEAD/core/graphics/noise-grain-texture.md [index]
- Canonical grain params (`fractalNoise`, `baseFrequency 0.65`, `numOctaves 3`, `stitchTiles`) — https://github.com/t1mdurden/prd-pipeline/blob/HEAD/plugins/superdesign/skills/superdesign/references/cookbook/texture.md [index]
- Grain opacity 0.04–0.08, never animated — https://github.com/deepception/cc_tool/blob/HEAD/templates/skills/design-director/references/aesthetic-organic-tactile.md [index]

**State / a11y / Tailwind:**
- Zustand TypeScript guide (curried `create<T>()(...)`) — https://github.com/pmndrs/zustand/blob/HEAD/docs/learn/guides/beginner-typescript.md [index]
- Accessibility skill: focus management, `focus-visible`, Escape dismisses — https://github.com/ericmoin/oh-my-role/blob/HEAD/roles/react-frontend/skills/accessibility/SKILL.md [index]
- Tailwind v4 3D transform utilities — https://github.com/impertio-studio/tailwindcss-claude-skill-package/blob/HEAD/skills/source/tailwind-syntax/tailwind-syntax-3d-transforms/SKILL.md [index]
- Tailwind v4 3D utilities reference — https://github.com/markshd12-cloud/jarvis/blob/HEAD/agents/skills/tailwind-css-v4/SKILL.md [index]
- React Spectrum Card accessibility spec — https://github.com/adobe/react-spectrum/blob/HEAD/specs/accessibility/Card.mdx [index]
