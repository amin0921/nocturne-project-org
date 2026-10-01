# PATCH 04 — Phase 01 · Interactive Empty States & Undo Toasts

**Date:** 2026-09-30 · **Parent doc:** `nocturne-ux-ui-research.md`
**Feeds the consultant brief:** §2 Feature 4 (Empty States & Undo Toasts), §3.A component breakdown, §3.B states, §3.C micro-interactions (Toast Choreography, Undo Flash), §3.D render governance.
**Source material:** live recon of 9 UI/component sites, 2026-09-30 (verified findings; full per-site verdicts in the parent doc).

> **Hard constraints (non-negotiable):** No Framer Motion / Three.js / Lottie. Animations via CSS transitions, CSS keyframes, Tailwind utilities, or WAAPI only. Animate `transform` and `opacity` only — no layout or paint triggers. Near-zero idle CPU; DWM/transparent-window safe. Palette: `#0A0B0E` base, `#121419` surface, `#1A1E27` raised, `#EAB308` amber, `#A8B0BE` muted. JetBrains Mono for time codes. LTR shell, `dir="auto"` Persian text, Latin digits.

---

## 1. Material found

| Site | Component / Recipe | What it gives Nocturne | URL | License | Animation tech |
|---|---|---|---|---|---|
| beautifului.dev | **Search** — command palette WITH explicit empty state | The empty-state vocabulary: titled empty panel + action button ("no results → clear / create"). Model for all Nocturne empty states (Library / Queue / History). | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| kokonutui.com | **File Upload** — drag-drop drop zone with animated progress, validation, error states | Library empty-state drop zone: drag-over highlight, file validation feedback, error vs success states. Motion-based; rebuild with CSS. | https://kokonutui.com/ | Free & open-source claim — license **unverified** | Motion-based ⚠️ reimplement |
| morphin.dev/inspirations | **Gradient File Upload Component** (video ref) | Visual reference for the drop zone's look/feel only; no code on free tier. | https://morphin.dev/inspirations | N/A (gallery) | Visual-only |
| ui.spectrumhq.in | **Undo Pill** — floating undo toast with DRAINING COUNTDOWN RING, pause-on-hover, rollback button | **Closest existing pattern to the brief's 10s undo toast.** Take the behavior spec (floating pill, countdown ring, pause-on-hover, Undo button) and reimplement the ring/bar in pure CSS — their implementation is Motion-driven. | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ, incl. commercial) | Motion-based ⚠️ reimplement |
| ui.spectrumhq.in | **Toast Stack** / **Notification Bell** | Stacking semantics for multiple toasts. | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ, incl. commercial) | Motion-based ⚠️ |
| transitions.dev | **Toast open/close** — rises with fade/blur/scale | Exact toast choreography recipe: enter = rise + fade + slight scale + blur resolve. | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Toast dismiss** — hover lifts to expose Delete/Archive | Hover behavior for toast actions (lift reveals Undo button emphasis). | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Banner stacking** | Toast stacking order/depth (shared with patch-03 banners). | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| reverseui.com | **Timeline Progress** — timed progress visualization | Closest to the 10s linear countdown bar: timed linear progress under content. Pure-CSS reimplementation target. | https://reverseui.com/ | Free $0 (commercial); rest paid | Framer-Motion-built ⚠️ reimplement |
| skiper-ui.com | — | DISQUALIFIED. Motion.dev + GSAP. | https://skiper-ui.com/ | Free w/ attribution; Pro $129 | ⚠️ disqualified |
| string-tune.fiddle.digital/skill-hub | — | NONE relevant. | https://string-tune.fiddle.digital/skill-hub | N/A | N/A |
| uselayouts.com/browse | — | No toasts, no empty states, no countdown badge. N/A for this patch. | https://uselayouts.com/browse | Free open-source | N/A |

## 2. Lift vs. reimplement

**Lift as-is:**
- transitions.dev "Toast open/close" + "Toast dismiss" + "Banner stacking" → `UndoToast.tsx` choreography verbatim (see §4).
- beautifului Search's empty-state block → structure of `EmptyState.tsx` (icon/illustration slot, title, description, primary action); adapt to dark glass + amber CTA.

**Reimplement:**
- Spectrum Undo Pill → keep behavior spec (pill, countdown, pause-on-hover, rollback), rebuild the draining indicator as a **CSS linear progress bar** (`scaleX(1→0)`, `transform-origin: left`, 10 s linear) — a ring would need SVG stroke animation; the brief explicitly asks for the bar, so the bar wins and is simpler.
- kokonutui File Upload → drop zone states (idle / drag-over / validating / error) rebuilt with CSS: drag-over = `opacity` overlay + border glow; progress = bar with `transform: scaleX` driven by upload events.
- reverseui Timeline Progress → its linear timed-progress math informs the toast bar duration mapping; reimplement as above.

## 3. Gaps — design from scratch

1. **The 10s linear countdown bar itself.** No site ships exactly "toast + linear drain bar + Undo rollback" in CSS. The consultant must spec it as a shared primitive (see §4): one `CountdownBar` component reused by undo toasts (10 s) and the session restore banner (15 s, patch-03).
2. **Undo flash on restored items.** Brief asks for an amber outline/glow flash on restored queue items. No source covers this; design: `box-shadow` keyframe on restored rows, 600 ms, then removed (paint cost bounded to one row, one flash; disabled in reduced-motion).
3. **Empty-state copy (Persian-safe).** Library drop zone, Queue ("Start Autoplay / Play from Library"), History ("No listening history yet") — write short `dir="auto"` copy; Latin digits where numbers appear.
4. **Pause-on-hover semantics.** Spectrum's pill pauses on hover. Spec: hovering the toast pauses the drain (CSS `animation-play-state: paused`) AND extends nothing — resume continues; define whether expiry while hovered still dismisses (recommend: yes, but Undo click always wins).

## 4. Mapping to the brief

**§A — Component hierarchy** (`nocturne-tauri/src/components/`):
- `toast/UndoToast.tsx` — pill: message (dir="auto"), Undo button, `CountdownBar`.
- `toast/CountdownBar.tsx` — shared linear drain primitive (10 s default, duration prop).
- `toast/ToastStack.tsx` — stacking container (max 3 visible, Banner-stacking depth).
- `empty/EmptyState.tsx` — generic: illustration slot, title, description, primary + secondary actions.
- `empty/LibraryDropZone.tsx` — drag-over states + folder-picker CTA (File-Upload pattern, CSS rebuild).
- `empty/QueueEmptyState.tsx`, `empty/HistoryEmptyState.tsx` — brief's specified copy + actions.

**§B — States inventory** (per component): Default · Hover (toast lifts `translateY(-2px)`, drain pauses; drop zone glows) · Active/Pressed (Undo button `scale(0.96)`) · Focused (toast focusable, `U` = undo shortcut, Esc dismisses) · Executing (draining — bar animates) · Paused (hover) · Disabled (Undo after expiry — toast gone) · Empty · Error (drop zone: invalid files).

**§C — Keyframe recipes:**
- Toast enter: `opacity 0→1, translateY(12px→0), scale(0.97→1), blur(4px→0)` — 240 ms `cubic-bezier(0.16, 1, 0.3, 1)`; exit: `opacity 1→0, translateY(0→8px), scale(1→0.98)` 180 ms ease-in.
- Countdown drain: `@keyframes drain { from { transform: scaleX(1) } to { transform: scaleX(0) } }`, `10s linear forwards`, `transform-origin: left`; amber `#EAB308` → the last 2 s shift to a brighter stop via a second layered bar or `animation` on opacity — keep it one element, one property.
- Undo flash (restored rows): `box-shadow: 0 0 0 0 rgba(234,179,8,0)` → `0 0 0 2px rgba(234,179,8,.8)` → `0`, 600 ms ease-out, once.
- Drop zone drag-over: overlay `opacity 0→1` 150 ms; border glow pulse 1.2 s infinite while dragging.

**§D — Render governance:**
- **The countdown bar is CSS-driven, not React-driven.** Mount sets `animation: drain 10s linear forwards`; `animationend` → dismiss + cleanup. No interval, no per-frame state — zero re-renders during the 10 s. Pause-on-hover = `animation-play-state: paused` on the bar element.
- Undo action: rollback reads a pre-captured snapshot (taken before the destructive action); the toast never re-renders the queue — it calls one store method.
- Toast stack: entering a 4th toast removes the oldest via the same exit animation; stack container is a fixed-position portal, never inside a scrolling list (no layout invalidation of lists).
- Idle: toasts unmount fully on dismiss; no lingering timers. Reduced-motion: drain bar becomes a static full bar that simply disappears at expiry (no animation), toast enter/exit become instant opacity.
