# PATCH 01 — Phase 01 · Sleep Timer with Fade-Out

**Date:** 2026-09-30 · **Parent doc:** `nocturne-ux-ui-research.md`
**Feeds the consultant brief:** §2 Feature 1 (Sleep Timer with Fade-Out), §3.A component breakdown, §3.B states, §3.C micro-interactions, §3.D render governance.
**Source material:** live recon of 9 UI/component sites, 2026-09-30 (verified findings; full per-site verdicts in the parent doc).

> **Hard constraints (non-negotiable):** No Framer Motion / Three.js / Lottie. Animations via CSS transitions, CSS keyframes, Tailwind utilities, or WAAPI only. Animate `transform` and `opacity` only — no layout or paint triggers. Near-zero idle CPU; DWM/transparent-window safe. Palette: `#0A0B0E` base, `#121419` surface, `#1A1E27` raised, `#EAB308` amber, `#A8B0BE` muted. JetBrains Mono for time codes. LTR shell, `dir="auto"` Persian text, Latin digits.

---

## 1. Material found

| Site | Component / Recipe | What it gives Nocturne | URL | License | Animation tech |
|---|---|---|---|---|---|
| beautifului.dev | **Filter Table** — status filter chips with counts | The exact preset-chip UI: rounded chips with active indicator; maps directly to 15m / 30m / 45m / End of Track / End of Queue preset selection. Source shows pure React + Tailwind transition classes + inline styles (`transition-[grid-template-rows,opacity] duration-300`, cubic-bezier), no Motion. | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| ui.spectrumhq.in | **Status Badge** — neutral/info/success/warning/error, pulsing "Connecting" indicator | CSS-only breathing indicator. Model for the sleep timer's "active countdown" breathing pill in PlayerBar/MicroDock. | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ, incl. commercial) | CSS-ONLY ✅ |
| transitions.dev | **Notification badge** — diagonal slide with spring pop-in | Motion recipe for the countdown badge appearing in PlayerBar/MicroDock when timer starts; pop-in attention cue without layout thrash. | https://transitions.dev/ | Free personal + commercial (cannot redistribute library itself) | CSS-ONLY ✅ |
| transitions.dev | **Text states swap** — blur text swap | Recipe for minute/second digit changes on the countdown pill (blur-swap avoids janky digit reflow). | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Menu dropdown** — origin-aware open/close | Recipe for the timer popover mount/unmount animation (scale + opacity from the trigger origin). | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| transitions.dev | **Toggle** — thumb slide with bounce | Press/hover micro-state vocabulary for preset chips and the timer on/off switch. | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| kokonutui.com | **Profile Dropdown** — avatar dropdown + quick-action links | Structural model for the timer popover's internal layout (header + action list + footer), but the component itself uses Motion + Emotion. | https://kokonutui.com/ | Free & open-source claim — license file **not verified**, treat as unverified | Motion-based ⚠️ reimplement |
| uselayouts.com/browse | **Set Timer** — wheel-style timer popover | Verdict: NOT a match. Wheel picker conflicts with the brief's preset-chip + custom-minutes design. Listed only to confirm it was evaluated and rejected. | https://uselayouts.com/browse | Free open-source (603 GitHub stars) | Motion-based ⚠️ / N/A |
| string-tune.fiddle.digital/skill-hub | — | NONE relevant. AI-agent skill hub for a scroll/parallax animation library; wrong problem domain (no popovers, badges, timers). | https://string-tune.fiddle.digital/skill-hub | N/A | N/A |
| skiper-ui.com | — | DISQUALIFIED for this patch. Stack lists Motion.dev (framer-motion lineage) + GSAP; free w/ attribution, Pro $129. Nothing usable within constraints. | https://skiper-ui.com/ | Free w/ attribution; Pro $129 | ⚠️ disqualified |

## 2. Lift vs. reimplement

**Lift as-is (CSS-only, safe under constraints):**
- beautifului Filter Table chip markup → translate its chip structure into `PresetChips.tsx`; its `transition-[grid-template-rows,opacity]` collapse technique handles showing/hiding the custom-minutes input row without layout animation violations (grid-rows animates via `fr` interpolation, safe).
- Spectrum Status Badge pulsing keyframes → reuse the pulse ring keyframe (opacity + scale only) for the active-countdown pill's breathing indicator.
- transitions.dev recipes (badge pop-in, text swap, dropdown origin-aware open, toggle bounce) → copy the CSS verbatim, adapting cubic-bezier curves to the palette (see §4).

**Reimplement (never lift):**
- kokonutui Profile Dropdown layout → rebuild the popover shell with plain `absolute` positioning + transitions.dev "Menu dropdown" CSS; drop Motion/Emotion entirely.
- uselayouts Set Timer → ignore; the wheel paradigm contradicts the brief.
- All "spring" motions from Motion-based sources → convert to CSS `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot on `transform: scale()`; never animate `width/height` for the popover.

## 3. Gaps — design from scratch

1. **Sleep-timer popover layout itself.** No site had a preset-chip (15/30/45) + custom-minutes input + End of Track / End of Queue variant in one panel. The consultant must design this: header ("Sleep Timer"), preset chip grid, custom minutes numeric input (JetBrains Mono, Latin digits), End of Track / End of Queue as extended chips, footer with Cancel/Start.
2. **Fade-out ramp UI sync.** The brief requires the volume slider to subtly track the last-30s audio fade. No component site covers this; design: slider thumb follows via a CSS `transition` on a CSS variable updated at 1 Hz (see §5 render governance) — never a React state tick at animation frame rate.
3. **End-of-Queue awareness.** Preset "End of Queue" needs queue-length state wiring; pure UI research artifact — spec the contract with the queue store here.

## 4. Mapping to the brief

**§A — Component hierarchy** (`nocturne-tauri/src/components/`):
- `sleep/SleepTimerPopover.tsx` — popover shell (trigger-anchored, origin-aware mount).
- `sleep/PresetChips.tsx` — 15m / 30m / 45m / End of Track / End of Queue + active indicator (beautifului Filter Table pattern).
- `sleep/CustomMinutesInput.tsx` — numeric input, JetBrains Mono, Latin digits, min/max clamp.
- `sleep/CountdownPill.tsx` — PlayerBar/MicroDock badge with breathing pulse (Spectrum pattern) + digit text-swap animation.
- `sleep/SleepTimerToggle.tsx` — on/off switch with toggle micro-state (transitions.dev Toggle).

**§B — States inventory** (per component): Default · Hover (`opacity`/glow lift) · Active/Pressed (scale 0.97) · Focused (visible `:focus-visible` ring, keyboard: Tab order + Enter/Space + Esc closes popover) · Executing/active-countdown (breathing pulse on pill, chip disabled state on Start) · Disabled · Empty (no timer set → trigger shows clock icon only).

**§C — Keyframe recipes** (exact, CSS-only):
- Popover mount: `opacity 0→1, scale(0.96→1), translateY(4px→0)`, 180 ms, `cubic-bezier(0.16, 1, 0.3, 1)`; unmount: reverse at 140 ms.
- Badge pop-in: `scale(0.6→1.05→1)` with 260 ms `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring feel, transform-only).
- Countdown digit change: blur-swap — outgoing `opacity 1→0, blur(0→4px), translateY(0→-6px)` 150 ms; incoming reverse.
- Breathing pulse (active countdown): `scale(1→1.06→1)` + `opacity` ring, 2.4 s ease-in-out infinite, keyframes on a `::after` pseudo-element so the pill itself never repaints.
- Preset chip press: `scale(1→0.96)` 120 ms; active chip: amber glow via `box-shadow` — note: `box-shadow` is paint, not composite; restrict to the single active chip and disable in reduced-motion.

**§D — Render governance:**
- Countdown tick updates **at most 1 Hz**, and only the `CountdownPill` subtree re-renders (local state inside the pill component; parent PlayerBar/MicroDock untouched).
- The digit-swap is pure CSS driven by a `key={seconds}` remount — React renders text; the animation runs on the compositor.
- Volume fade ramp: audio gain via Web Audio / element volume at 10 Hz max from a `requestAnimationFrame`-throttled timer; the slider thumb position is set through a CSS custom property (`--fade-vol`) read by a `transition: left 100ms linear` — no per-frame React state.
- Idle: when no timer is active, all keyframe loops are `animation: none`; the popover unmounts fully (no hidden timers).
