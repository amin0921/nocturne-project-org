# PATCH 03 — Phase 01 · Listening Sessions (Checkpoint & Crash Recovery)

**Date:** 2026-09-30 · **Parent doc:** `nocturne-ux-ui-research.md`
**Feeds the consultant brief:** §2 Feature 3 (Listening Sessions), §3.A component breakdown, §3.B states, §3.C micro-interactions, §3.D render governance.
**Source material:** live recon of 9 UI/component sites, 2026-09-30 (verified findings; full per-site verdicts in the parent doc).

> **Hard constraints (non-negotiable):** No Framer Motion / Three.js / Lottie. Animations via CSS transitions, CSS keyframes, Tailwind utilities, or WAAPI only. Animate `transform` and `opacity` only — no layout or paint triggers. Near-zero idle CPU; DWM/transparent-window safe. Palette: `#0A0B0E` base, `#121419` surface, `#1A1E27` raised, `#EAB308` amber, `#A8B0BE` muted. JetBrains Mono for time codes. LTR shell, `dir="auto"` Persian text, Latin digits.

---

## 1. Material found

| Site | Component / Recipe | What it gives Nocturne | URL | License | Animation tech |
|---|---|---|---|---|---|
| transitions.dev | **Banner stacking** — banners stack three deep | The restore-session banner pattern: banners enter and stack with depth; model for "Restore previous session?" appearing above content. | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Menu dropdown** — origin-aware open/close | Session-manager dropdown mount/unmount (Save session / session list / delete). Same recipe as patch-01. | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| kokonutui.com | **Profile Dropdown** — avatar dropdown with subscription card + quick-action links | Structural model for the session-manager menu: header card (current session name + track count) + action list (Save / Restore / Rename / Delete). Motion+Emotion → rebuild in CSS. | https://kokonutui.com/ | Free & open-source claim — license **unverified** | Motion-based ⚠️ reimplement |
| beautifului.dev | **Chat** — tabbed panel | Where the session entry point lives: session actions integrated in the queue panel header/tab bar. | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| uselayouts.com/browse | **Smooth Dropdown** / **Discrete Tabs** | Alternative dropdown/tab references; code behind login, not fetched. Structural backup only. | https://uselayouts.com/browse | Free open-source | Motion-based ⚠️ / N/A |
| ui.spectrumhq.in | **Hold to Confirm** — press-and-hold micro-state | Micro-interaction vocabulary for destructive session actions (Delete session = hold-to-confirm, prevents accidents). | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ, incl. commercial) | Motion-based docs ⚠️ (reimplement in CSS) |
| morphin.dev/inspirations | — | Visual-only refs for banner/toast treatments (Page Transition / Desktop / Minimal tags). | https://morphin.dev/inspirations | N/A (gallery) | Visual-only |
| reverseui.com | **Navigation Indicator** | Secondary reference for active-session indicator dot. | https://reverseui.com/ | Free $0 (commercial); rest paid | Framer-Motion-built ⚠️ |
| skiper-ui.com | — | DISQUALIFIED. Motion.dev + GSAP. | https://skiper-ui.com/ | Free w/ attribution; Pro $129 | ⚠️ disqualified |
| string-tune.fiddle.digital/skill-hub | — | NONE relevant. | https://string-tune.fiddle.digital/skill-hub | N/A | N/A |

## 2. Lift vs. reimplement

**Lift as-is:**
- transitions.dev "Banner stacking" CSS → `RestoreBanner.tsx` enter/exit and depth treatment verbatim; the "three-deep" logic caps concurrent banners (restore banner + toast never fight).
- transitions.dev "Menu dropdown" CSS → session-manager dropdown shell (same origin-aware recipe as patch-01 popover).

**Reimplement:**
- kokonutui Profile Dropdown → keep the *information architecture* (header card + action list + footer) but rebuild with absolute positioning + the transitions.dev dropdown CSS; strip Motion/Emotion.
- Spectrum "Hold to Confirm" → reimplement as CSS: a `::before` fill bar driven by `:active` with `transition: width 600ms linear`; confirm fires on pointer-up past threshold — no Motion, no JS timer at frame rate.

## 3. Gaps — design from scratch

1. **Session manager UX itself.** No site ships a "saved listening sessions" manager. The consultant must design: named session list rows (name dir="auto", track count, saved date, duration), Save-current flow (inline rename input), Restore (confirm if queue non-empty), Delete (hold-to-confirm).
2. **Restore-banner behavior contract.** Define: appears on launch when a checkpoint exists AND queue is empty; "Restore previous session?" + [Restore] [Dismiss]; auto-dismisses after 15 s (CSS-driven progress, same drain pattern as patch-04 toasts); checkpoint written on every queue mutation (debounced) + on app close.
3. **Crash-recovery copy.** Distinguish clean-exit checkpoint ("Continue where you left off") from crash-detected checkpoint ("We recovered your queue") — different banner copy, same component.
4. **Checkpoint format.** Pure engineering spec: JSON snapshot {tracks[], index, positionMs, shuffle, repeat} in SQLite; banner copy needs the session's track count + saved relative time.

## 4. Mapping to the brief

**§A — Component hierarchy** (`nocturne-tauri/src/components/`):
- `sessions/RestoreBanner.tsx` — launch banner (Banner-stacking pattern), stacked above toasts.
- `sessions/SessionManagerDropdown.tsx` — anchored dropdown: header card + session rows + actions (Profile-Dropdown architecture, CSS rebuild).
- `sessions/SessionRow.tsx` — name, meta (count · duration · saved-ago), Restore / Delete (hold-to-confirm).
- `sessions/SaveSessionDialog.tsx` — inline rename input; or a lightweight popover if dialog is too heavy — consultant decides, both specced.
- `sessions/ActiveSessionIndicator.tsx` — dot + name in queue header when a saved session is loaded (reverseui Navigation Indicator pattern).

**§B — States inventory** (per component): Default · Hover (row actions fade in) · Active/Pressed · Focused (full keyboard: arrows move, Enter restores, Esc closes dropdown) · Executing (saving spinner = CSS `rotate` on transform, 600 ms linear infinite; restoring = banner exit) · Disabled (Restore disabled when session empty) · Empty (no saved sessions → "No saved sessions yet" + Save-current CTA; → patch-04 empty-state pattern) · Hold-to-confirm armed (delete).

**§C — Keyframe recipes:**
- Restore banner enter: `opacity 0→1, translateY(-8px→0), scale(0.98→1)` 220 ms `cubic-bezier(0.16, 1, 0.3, 1)`; exit reverses 160 ms.
- Banner auto-dismiss drain: same linear `scaleX(1→0)` progress bar as the undo toast (patch-04) — shared component, 15 s here.
- Dropdown: origin-aware `scale(0.96→1) + opacity`, 180 ms.
- Saving spinner: `rotate(0→360deg)` 600 ms linear infinite on an SVG — transform-only, compositor-safe.
- Hold-to-confirm fill: `width 0→100%` via `::before` + `transition: width 600ms linear` triggered by `:active`.

**§D — Render governance:**
- Checkpoint writes are debounced (≥ 2 s after last queue mutation) and happen in the store layer — the banner/dropdown never trigger writes.
- Restore banner visibility is a single boolean in a session store; auto-dismiss countdown is CSS-driven (animation fill + `animationend` → dismiss), not a React interval — zero re-renders during the 15 s.
- Session dropdown unmounts on close; no background polling for session list freshness (refetch on open only).
