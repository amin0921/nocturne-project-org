# PATCH 05 — Phase 01 · Motion Recipe Catalog (shared)

**Date:** 2026-09-30 · **Parent doc:** `nocturne-ux-ui-research.md`
**Feeds the consultant brief:** §3.C (all micro-interactions), §3.D (Idle Performance & Render Governance) — this patch is the shared motion vocabulary patches 01–04 reference.
**Source material:** live recon of 9 UI/component sites, 2026-09-30 (verified findings; full per-site verdicts in the parent doc).

> **Hard constraints (non-negotiable):** No Framer Motion / Three.js / Lottie. Animations via CSS transitions, CSS keyframes, Tailwind utilities, or WAAPI only. Animate `transform` and `opacity` only — no layout or paint triggers. Near-zero idle CPU; DWM/transparent-window safe. Palette: `#0A0B0E` base, `#121419` surface, `#1A1E27` raised, `#EAB308` amber, `#A8B0BE` muted. JetBrains Mono for time codes. LTR shell, `dir="auto"` Persian text, Latin digits.

---

## 1. Material found (recipe-level sources)

| Site | Recipe | Used by patches | URL | License | Animation tech |
|---|---|---|---|---|---|
| transitions.dev | **Toast open/close** (rise + fade/blur/scale) | 04 (toast choreography) | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Toast dismiss** (hover lifts to expose actions) | 04 (undo toast hover) | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Banner stacking** (three-deep) | 03 (restore banner), 04 (toast stack) | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Tabs sliding** (pill indicator) | 01→02 shared Queue/History switcher | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Menu dropdown** (origin-aware open/close) | 01 (timer popover), 03 (session dropdown) | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Notification badge** (diagonal slide + spring pop-in) | 01 (countdown pill) | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Text states swap** (blur text swap) | 01 (countdown digit changes) | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Toggle** (thumb slide + bounce) | 01 (timer toggle), micro-states | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| beautifului.dev | **Filter Table** chips + grid-rows collapse | 01 (preset chips), 02 (filter chips) | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| beautifului.dev | **Records Table** rows + sort headers | 02 (history rows) | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| beautifului.dev | **Chat** tabbed panel | 02, 03 (panel structure) | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| beautifului.dev | **Search** empty state | 04 (empty-state block) | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| beautifului.dev | **Sidebar Nav** gliding hover states | Micro-states (press/hover/focus) | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| ui.spectrumhq.in | **Undo Pill** (draining ring, pause-on-hover) | 04 (behavior spec → CSS bar) | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ) | Motion-based ⚠️ reimplement |
| ui.spectrumhq.in | **Status Badge** (CSS-only pulse) | 01 (breathing indicator) | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ) | CSS-ONLY ✅ |
| ui.spectrumhq.in | **Recent Activity** rows | 02 (row hierarchy) | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ) | Motion docs ⚠️ reimplement |
| ui.spectrumhq.in | **Hold to Confirm** | 03 (delete session) | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ) | Motion docs ⚠️ reimplement |
| kokonutui.com | **File Upload** drop zone states | 04 (drop zone) | https://kokonutui.com/ | Claim unverified | Motion-based ⚠️ reimplement |
| kokonutui.com | **Profile Dropdown** architecture | 01, 03 (dropdown IA) | https://kokonutui.com/ | Claim unverified | Motion-based ⚠️ reimplement |
| kokonutui.com | **Hold Button** | 03 (micro-state backup) | https://kokonutui.com/ | Claim unverified | Motion-based ⚠️ reimplement |
| reverseui.com | **Exclusion Tabs** (pure-CSS sliding pill via `mix-blend-mode: exclusion`) | 02 — most CSS-friendly technique found; native alternative to Motion tab indicators | https://reverseui.com/ | Free $0 (commercial) | CSS-friendly ✅ (technique, not lift) |
| reverseui.com | **Timeline Progress** (timed linear progress) | 04 (countdown bar math) | https://reverseui.com/ | Free $0 (commercial) | Framer-built ⚠️ reimplement |
| reverseui.com | **Logs Explorer** (timestamped color-coded rows) | 02 (row hierarchy) | https://reverseui.com/ | Free $0 (commercial) | Framer-built ⚠️ reimplement |
| morphin.dev/inspirations | Gallery refs (upload, page transitions) | 04 (visual ref only) | https://morphin.dev/inspirations | N/A | Visual-only |
| uselayouts.com/browse | Set Timer (rejected), Discrete Tabs, Smooth Dropdown | Structural backup | https://uselayouts.com/browse | Free open-source | Motion-based ⚠️ |
| skiper-ui.com | — | DISQUALIFIED (Motion.dev + GSAP) | https://skiper-ui.com/ | Free w/ attribution; Pro $129 | ⚠️ disqualified |
| string-tune.fiddle.digital/skill-hub | — | NONE relevant | https://string-tune.fiddle.digital/skill-hub | N/A | N/A |

## 2. Recipes organized by brief §C behaviors

### 2.1 Toast choreography (patches 04, 03)
Source: transitions.dev "Toast open/close" + "Toast dismiss" + "Banner stacking".
- Enter: `opacity 0→1 · translateY(12px→0) · scale(0.97→1) · blur(4px→0)` — 240 ms `cubic-bezier(0.16,1,0.3,1)`.
- Exit: `opacity 1→0 · translateY(0→8px) · scale(1→0.98)` — 180 ms `ease-in`.
- Hover: `translateY(-2px)` 150 ms; reveals/emphasizes action button.
- Stack: max 3, depth via `translateY(-n*6px) scale(1-n*0.03)` on older toasts; newest on top.

### 2.2 Tab / surface switching (patch 02)
Source: transitions.dev "Tabs sliding"; reverseui "Exclusion Tabs" technique.
- Sliding pill: `transform: translateX()` 220 ms `cubic-bezier(0.32,0.72,0,1)`; measure tab positions once on mount (ResizeObserver only while panel visible, disconnect after).
- reverseui's `mix-blend-mode: exclusion` trick: indicator inverts label color purely in CSS — elegant but verify contrast against the obsidian palette before adopting; default to amber pill + label color cross-fade.
- Panel content swap: outgoing `opacity 1→0 · translateX(0→∓12px)` 160 ms; incoming `opacity 0→1 · translateX(±12px→0)` 200 ms (directional).

### 2.3 Popover / dropdown mount-unmount (patches 01, 03)
Source: transitions.dev "Menu dropdown"; kokonutui "Profile Dropdown" IA.
- Mount: `opacity 0→1 · scale(0.96→1) · translateY(4px→0)` — 180 ms `cubic-bezier(0.16,1,0.3,1)`, `transform-origin` set to the trigger edge.
- Unmount: reverse, 140 ms.
- Structure (from kokonutui IA): header card → action list → footer; all plain absolutely-positioned divs.

### 2.4 Countdown badge pop-in (patch 01)
Source: transitions.dev "Notification badge".
- Pop-in: `scale(0.6→1.05→1)` 260 ms `cubic-bezier(0.34,1.56,0.64,1)` (spring feel, transform-only) + diagonal `translate(6px,-6px → 0,0)`.
- Active-countdown breathing (Spectrum Status Badge CSS pulse): `scale(1→1.06→1)` + ring `opacity`, 2.4 s ease-in-out infinite on a `::after` pseudo-element — the pill itself never repaints.

### 2.5 Digit / text swap (patch 01)
Source: transitions.dev "Text states swap".
- Outgoing: `opacity 1→0 · blur(0→4px) · translateY(0→-6px)` 150 ms; incoming: reverse. Drive by `key={value}` remount — React renders text, compositor runs the animation.

### 2.6 Press / hover / focus micro-states (all patches)
Sources: transitions.dev "Toggle"; beautifului "Sidebar Nav"; Spectrum "Hold to Confirm"; kokonutui "Hold Button".
- Press: `scale(1→0.96)` 120 ms; release springs back via the same 260 ms overshoot curve.
- Hover lift (cards/rows): `translateY(-1px)` + border-color transition 150 ms — no shadow animation (paint); a static shadow is fine.
- Focus: `:focus-visible` 2px amber ring via `outline` — `outline` does not trigger layout; acceptable.
- Hold-to-confirm: `::before` fill `width 0→100%` with `transition: width 600ms linear` under `:active`; confirm on pointer-up past threshold.

## 3. Cubic-bezier / duration guidance (global)

| Intent | Curve | Duration | Notes |
|---|---|---|---|
| Standard enter | `cubic-bezier(0.16, 1, 0.3, 1)` | 180–240 ms | Default for popovers, toasts, panels |
| Spring pop | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 240–300 ms | Badges, count pops, press release — transform-only |
| Tab pill glide | `cubic-bezier(0.32, 0.72, 0, 1)` | 220 ms | Matches native tab feel |
| Exit/dismiss | `ease-in` or `cubic-bezier(0.4, 0, 1, 1)` | 140–180 ms | Exits are faster than enters |
| Linear drains | `linear` | 10 s (toast) / 15 s (banner) | Countdown bars — never eased |
| Breathing loops | `ease-in-out` infinite | 2–2.4 s | Status indicators only |

## 4. Why CSS animations must drive countdown/progress visuals (brief §D)

**Rule: no React state loops for anything that moves on a timer.** The 1%-idle-CPU budget survived by killing rAF loops and 4 Hz cross-window posts; Phase 01 must not reintroduce them.

- **Countdown bars** (toast 10 s, banner 15 s): single CSS `animation: drain Xs linear forwards` on `transform: scaleX`; completion via `animationend`. Zero re-renders, zero intervals. Pause-on-hover = `animation-play-state: paused`.
- **Countdown digits** (sleep timer): tick at **1 Hz max**, state local to the pill component; digit change animated by CSS `key` remount (see §2.5). Parent PlayerBar never re-renders.
- **Breathing/pulse loops**: infinite CSS keyframes on pseudo-elements; set `animation: none` when the state they indicate is inactive.
- **Volume fade sync** (sleep timer): audio gain stepped at ≤10 Hz from one throttled rAF; the UI slider follows via a CSS custom property (`--fade-vol`) with `transition: 100ms linear` — one paint per step, no React render.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` + an in-app setting — all enters become instant opacity, drains become static bars that vanish at expiry, breathing stops, stagger delays drop to 0.

## 5. Persian/RTL + DWM guardrails for all recipes

- Every animated text surface keeps `dir="auto"`; digits stay Latin (JetBrains Mono) — blur-swap and tab-pill math assume LTR digit flow.
- Blur in toast enter (`blur(4px→0)`) is a filter animation — compositor-cheap for one small pill, but never use blur loops or blur on large surfaces (DWM transparent window = full-window paint risk).
- `mix-blend-mode: exclusion` (reverseui technique): test against `#0A0B0E` — exclusion on near-black can wash out; keep as an option, default to the amber pill.
- No recipe may animate `width/height/top/left/margin/padding`; the single sanctioned exception is `grid-template-rows` collapse (beautifului Filter Table) for showing/hiding the custom-minutes row, which interpolates `fr` units without layout thrash.
