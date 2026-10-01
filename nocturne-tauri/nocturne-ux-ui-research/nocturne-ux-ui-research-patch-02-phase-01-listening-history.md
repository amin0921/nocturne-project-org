# PATCH 02 — Phase 01 · Listening History & Play Counts

**Date:** 2026-09-30 · **Parent doc:** `nocturne-ux-ui-research.md`
**Feeds the consultant brief:** §2 Feature 2 (Listening History & Play Counts), §3.A component breakdown, §3.B states, §3.C micro-interactions, §3.D render governance.
**Source material:** live recon of 9 UI/component sites, 2026-09-30 (verified findings; full per-site verdicts in the parent doc).

> **Hard constraints (non-negotiable):** No Framer Motion / Three.js / Lottie. Animations via CSS transitions, CSS keyframes, Tailwind utilities, or WAAPI only. Animate `transform` and `opacity` only — no layout or paint triggers. Near-zero idle CPU; DWM/transparent-window safe. Palette: `#0A0B0E` base, `#121419` surface, `#1A1E27` raised, `#EAB308` amber, `#A8B0BE` muted. JetBrains Mono for time codes. LTR shell, `dir="auto"` Persian text, Latin digits.

---

## 1. Material found

| Site | Component / Recipe | What it gives Nocturne | URL | License | Animation tech |
|---|---|---|---|---|---|
| beautifului.dev | **Records Table** — sort headers, tags, relative-time ("4 days ago") | Direct model for history rows: sortable columns, tag/badge chips, relative timestamps. Pure Tailwind; copy row markup and adapt. | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| beautifului.dev | **Filter Table** — status filter chips with counts | Filter states for History: All / Completed / Skipped / Today / This week. Same chip pattern as patch-01. | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| beautifului.dev | **Chat** — tabbed panel | Tabbed-panel structure for the Queue / History / Specs container: animated tab switch without layout thrash. | https://www.beautifului.dev/ | MIT (confirmed on /license) | CSS-ONLY ✅ |
| ui.spectrumhq.in | **Recent Activity** — feed rows with relative times (15s, 15H, 30H, 1D, 2W) + action badges | History-row vocabulary: relative-time chips in JetBrains Mono style, completion-state badges (played / skipped). | https://ui.spectrumhq.in/ | Apache 2.0 (FAQ, incl. commercial) | Motion-based docs ⚠️ (pattern liftable, reimplement motion) |
| reverseui.com | **Logs Explorer** — timestamped, color-coded log entries | Row pattern for timestamp + colored completion badge; color-code "completed" vs "skipped" (amber vs muted). 19 components free (Free plan $0, commercial). | https://reverseui.com/ | Free plan $0 (commercial); rest paid | Framer-Motion-built ⚠️ reimplement |
| transitions.dev | **Tabs sliding** — pill indicator slides to active tab | Exact Queue⇄History switcher recipe: pill indicator translates under the active tab. | https://transitions.dev/ | Free personal + commercial | CSS-ONLY ✅ |
| kokonutui.com | **Smooth Tab** — animated sliding-pill tab switcher | Alternative pill-tab reference, but Motion-based. Prefer transitions.dev recipe above. | https://kokonutui.com/ | Free & open-source claim — license **unverified** | Motion-based ⚠️ reimplement |
| uselayouts.com/browse | **Discrete Tabs** | Second-source tab pattern; code behind login (not fetched). Listed for completeness. | https://uselayouts.com/browse | Free open-source | Motion-based ⚠️ / N/A |
| morphin.dev/inspirations | — | Visual-reference only for history/list layouts (tag filters: Desktop, Minimal, Dark). No copyable code (free tier); /components gated. | https://morphin.dev/inspirations | N/A (gallery) | Visual-only |
| skiper-ui.com | — | DISQUALIFIED. Motion.dev + GSAP stack; nothing within constraints. | https://skiper-ui.com/ | Free w/ attribution; Pro $129 | ⚠️ disqualified |
| string-tune.fiddle.digital/skill-hub | — | NONE relevant. | https://string-tune.fiddle.digital/skill-hub | N/A | N/A |

## 2. Lift vs. reimplement

**Lift as-is:**
- beautifului Records Table row markup → `HistoryRow.tsx` base: thumbnail, title/artist (dir="auto"), play-count badge, relative-time chip, completion badge. Its sort-header pattern gives the Sort/Filter toolbar.
- beautifului Filter Table chips → History filter chips (All / Completed / Skipped / Today) with the same active-indicator transition.
- transitions.dev "Tabs sliding" CSS → the Queue/History tab switcher verbatim (pill `transform: translateX`, indicator measured once on mount, cached — no per-frame measurement).

**Reimplement:**
- Spectrum Recent Activity + reverseui Logs Explorer: take only the row *information hierarchy* (relative time + badge); rebuild all motion in CSS (row enter = `opacity` + `translateY(8px→0)` staggered via `transition-delay` per index, capped at ~8 rows to bound paint).
- kokonutui Smooth Tab → ignore in favor of transitions.dev recipe (already CSS).

## 3. Gaps — design from scratch

1. **Nocturne-identity history row.** Sources give generic admin-table rows; the consultant must dress them in the cinematic language: glass row surface `#121419`, amber play-count numerals (JetBrains Mono, Latin digits), hover reveals "Play again / Add to queue / Remove" quick actions with `opacity` fade only.
2. **Completion-status semantics.** Define precisely: "completed" = listened ≥ 90% of duration; "skipped" = < 30 s; badge colors amber vs muted `#A8B0BE`. No source defines this for a local player.
3. **Play-count badge states.** Design count-up micro-animation on increment (small `scale` pop on the badge when a play lands — see §4).
4. **Long-list performance contract.** History can grow unbounded: specify virtualization or incremental rendering cap; the brief's 0%-idle rule means no per-row timers.

## 4. Mapping to the brief

**§A — Component hierarchy** (`nocturne-tauri/src/components/`):
- `history/HistoryPanel.tsx` — swaps into the Queue/History/Specs container.
- `history/HistoryToolbar.tsx` — filter chips (Filter Table pattern) + sort select.
- `history/HistoryRow.tsx` — track card: art thumb, title/artist, relative-time chip, completion badge, play-count badge (Records Table pattern).
- `history/HistoryEmptyState.tsx` — cross-link to patch-04 ("No listening history yet" + actions).

**§B — States inventory** (per component): Default · Hover (row lifts: `translateY(-1px)` + border glow, actions fade in) · Active/Pressed (`scale(0.99)`) · Focused (`:focus-visible` ring, arrow-key row navigation) · Sort states (column header asc/desc indicator) · Filter states (chip active, zero-result → empty state) · Disabled (rows for missing files: dimmed, `cursor: not-allowed`) · Empty (→ HistoryEmptyState).

**§C — Keyframe recipes:**
- Tab switcher pill: `transform: translateX()` 220 ms `cubic-bezier(0.32, 0.72, 0, 1)`; tab label color cross-fades via `color` transition 180 ms.
- Panel swap Queue⇄History: outgoing `opacity 1→0, translateX(0→-12px)` 160 ms; incoming `opacity 0→1, translateX(12px→0)` 200 ms `cubic-bezier(0.16, 1, 0.3, 1)` (directional: forward = slides left, back = right).
- Row enter: `opacity 0→1, translateY(8px→0)` 200 ms, `transition-delay: min(index,7) * 24ms`.
- Count badge pop: `scale(1→1.25→1)` 240 ms `cubic-bezier(0.34, 1.56, 0.64, 1)`, triggered by a `key={playCount}` remount.

**§D — Render governance:**
- History list renders from a memoized selector; the tick that updates "x minutes ago" labels runs **once per minute** in a single `HistoryRelativeTime` hook at the panel level — individual rows receive pre-computed strings, never their own timers.
- Filter/sort changes re-render the list only; the Queue panel (sibling) stays mounted but inert — tab switch hides via `hidden` + CSS, does not unmount audio-adjacent state.
- No scroll-linked animations; stagger caps at 8 rows so initial mount stays under frame budget. Reduced-motion: all enters become instant `opacity` 1.
