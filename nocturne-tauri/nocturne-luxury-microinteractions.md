# Nocturne — Micro-interaction Research & Proposals

**Project:** Nocturne — luxury offline desktop music player (Tauri v2 + React 18 + TS + Tailwind + SQLite + Zustand; frameless transparent window; floating glass islands on Obsidian `#0D0F15`; Studio Amber `#EAB308`; LTR layout with `dir="auto"` Persian text; Vazirmatn variable font)
**Brief source:** consultant model — 3–5 creative, practical, luxury micro-interactions focused on ease of use, physical/analog feel, smart visual details.
**Date:** 2026-09-23
**Hard constraints:** no heavy animation libraries; CSS transitions/keyframes + Web Animations API + hand-rolled springs only; 60fps on a modest Windows 10 PC; fully offline.

---

## 0. Shared motion primitives (use everywhere — zero new deps)

### Motion tokens

```css
:root {
  --ease-ios:  cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawer curve */
  --ease-out:  cubic-bezier(0.23, 1, 0.32, 1);   /* strong ease-out for UI */
  --ease-io:   cubic-bezier(0.77, 0, 0.175, 1);  /* on-screen movement */
  --amber: #EAB308;
}
```

Duration budget (verified conventions): button press feedback 100–160ms · tooltips/popovers 125–200ms · dropdowns 150–250ms · modals 200–500ms · **no UI animation over 300ms** except deliberate cinematic moves. Never `scale(0)` — enter from `scale(0.92–0.97)` + `opacity: 0` so nothing appears from nothing.

### The one spring hook (replaces framer-motion entirely)

All five proposals below use this single ~45-line hook — semi-implicit Euler integration, substepped ×2 for stability, direct DOM updates (zero React re-renders during animation), honors `prefers-reduced-motion` at the call site.

```tsx
// src/hooks/useSpring.ts — the only animation primitive Nocturne needs
import { useEffect, useRef } from 'react';

type SpringOpts = {
  stiffness?: number; damping?: number; mass?: number;
  onUpdate?: (x: number) => void;
};

/** iOS Dynamic Island ≈ spring(response: 0.35, dampingFraction: 0.75)
 *  → mass 1: stiffness ≈ 320, damping ≈ 27. */
export function useSpring(initial: number, opts: SpringOpts = {}) {
  const { stiffness = 320, damping = 27, mass = 1, onUpdate } = opts;
  const s = useRef({ x: initial, v: 0, target: initial });
  const raf = useRef(0);

  const step = () => {
    const st = s.current, dt = 1 / 60;
    for (let i = 0; i < 2; i++) {                       // substep: stable at high k
      const F = -stiffness * (st.x - st.target) - damping * st.v;
      st.v += (F / mass) * (dt / 2);
      st.x += st.v * (dt / 2);
    }
    onUpdate?.(st.x);
    if (Math.abs(st.v) > 0.001 || Math.abs(st.x - st.target) > 0.01) {
      raf.current = requestAnimationFrame(step);
    } else { st.x = st.target; st.v = 0; onUpdate?.(st.x); }
  };

  const set = (target: number, kick = 0) => {
    s.current.target = target;
    s.current.v += kick;                                 // preserves gesture velocity
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { set, get: () => s.current.x };
}
```

Reduced-motion policy: `const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches` → skip glow/ripple/overshoot; instant or 150ms crossfade.

---

## 1. NeedleDrop — tonearm seeking ritual

**Concept:** Grab the tonearm, swing it over the vinyl, release — the needle drops with a soft thump and the track seeks to that groove. The most analog gesture in the app.

**Why it fits Nocturne:** The vinyl simulator already rotates at 33⅓ RPM. This turns the decorative tonearm into the *primary seek control* — play/pause could even ride on it later (arm to rest = pause, per the Behance "Digital Turntable" ritual concept). It makes seeking feel like handling a record, not dragging a progress bar.

**Interaction spec**

| Phase | Trigger / behavior | Values |
|---|---|---|
| Rest | Arm parked on arm-rest, angle −38° from play position | opacity of stylus LED 40% |
| Hover | Pointer over 44px-wide invisible hitbox along the arm | Arm lifts 6px (`translateY(-6px)`, 200ms `--ease-out`); stylus tip glows amber (box-shadow 0 0 12px rgba(234,179,8,.8)) |
| Engage | `pointerdown` → arm follows pointer | Angle = atan2 from pivot, clamped to [−38°, +38°] arc; groove rings under the tip highlight amber within ±2°; tiny `cursor: grabbing` |
| Live preview | While engaged | Mini-player pill shows `mm:ss` tooltip at tip, updating ≤ every 100ms (no re-render storm — direct textContent update via ref) |
| Release | `pointerup` | ① Needle descends 8px in 120ms `--ease-ios`; ② 14px amber ripple ring expands from contact point over 600ms, fading to 0; ③ seek commits at contact (angle → progress linear map across the 76° arc); ④ optional "thump": 60ms lowpassed click at −18dB (Web Audio oscillator, toggleable) |
| Settle | After drop | Arm micro-settle spring: stiffness 320, damping 27 (≈ iOS response 0.35 / ζ 0.75) |
| Cancel | Esc or drag back to rest | Arm springs back to −38°; no seek |

**Code sketch (TSX + CSS)**

```tsx
// src/components/stage/Tonearm.tsx
const MIN_A = -38, MAX_A = 38;

export function Tonearm({ onSeek }: { onSeek: (ratio: number) => void }) {
  const armRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const angle = useSpring(MIN_A, {
    stiffness: 320, damping: 27,
    onUpdate: x => armRef.current?.style.setProperty('--arm-a', `${x}deg`),
  });

  const angleFromEvent = (e: PointerEvent, pivot: DOMRect) =>
    Math.max(MIN_A, Math.min(MAX_A,
      Math.atan2(e.clientY - (pivot.top + pivot.height / 2),
                 e.clientX - (pivot.left + pivot.width / 2)) * 180 / Math.PI));

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    angle.set(angleFromEvent(e.nativeEvent, armRef.current!.getBoundingClientRect()));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const ratio = (angle.get() - MIN_A) / (MAX_A - MIN_A);
    armRef.current?.classList.add('dropping');   // 8px descent, 120ms
    spawnRipple(e.clientX, e.clientY);            // 14px amber ring, 600ms
    setTimeout(() => { onSeek(ratio); armRef.current?.classList.remove('dropping'); }, 120);
  };

  return (
    <div ref={armRef} className="tonearm"
         onPointerDown={onPointerDown} onPointerUp={onPointerUp}
         onPointerMove={e => dragging.current &&
           angle.set(angleFromEvent(e.nativeEvent, armRef.current!.getBoundingClientRect()))}>
      <div className="tonearm-hit" />  {/* 44px invisible grab zone */}
      <div className="tonearm-rod" />
      <div className="tonearm-head"><span className="stylus-led" /></div>
    </div>
  );
}
```

```css
.tonearm { transform: rotate(var(--arm-a, -38deg)); transform-origin: 90% 10%; }
.tonearm-hit { position:absolute; inset:-22px; cursor:grab; }
.tonearm:hover { translate: 0 -6px; transition: translate 200ms var(--ease-out); }
.tonearm:hover .stylus-led { box-shadow: 0 0 12px rgba(234,179,8,.8); }
.tonearm.dropping { translate: 0 8px; transition: translate 120ms var(--ease-ios); }
.ripple { position:fixed; width:14px; height:14px; border:2px solid var(--amber);
  border-radius:9999px; animation: ripple 600ms var(--ease-out) forwards; pointer-events:none; }
@keyframes ripple { to { transform: scale(6); opacity: 0; } }
```

**References**
- https://www.behance.net/gallery/237278785/Digital-Turntable-Spotify-Vinyl-Design — tonearm as the symbolic bridge: moving it toward the record starts music, returning to rest stops it (the ritual this interaction digitizes)
- https://github.com/jnotsknab/mux-swarm/blob/HEAD/Skills/bundled/ux-ui/SKILL.md — micro-interaction timing/state conventions (100ms press feedback, 150–250ms transitions)

---

## 2. Detent Knob — the amber studio volume dial

**Concept:** A 72px machined-looking rotary volume knob with 21 magnetic detents (5% steps), an amber arc that fills like a VU meter, and tick feedback you can feel through your eyes: the knob visibly snaps into each detent while a 2ms tick sounds.

**Why it fits Nocturne:** Studio controls already exist in the brief; a linear volume slider is the least "studio" thing in a luxury player. The knob consolidates volume + mute + precise adjust into one tactile object and gives the glass-island stage a physical anchor.

**Interaction spec**

| Gesture | Behavior | Values |
|---|---|---|
| Vertical drag | Drag up/down anywhere on knob | 150px of travel = 0→100%; 1:1 direct mapping, knob rotates live (CSS var, no re-render) |
| Wheel | Hover + wheel notch | ±5% per notch; with Shift ±1% (precise mode) |
| Keyboard | Focus + arrows | ±5% (Shift ±1%); Home/End = 0/100; Alt+click = reset to 75% |
| Double-click | Mute toggle | Knob dims to 35%, amber arc collapses 200ms `--ease-ios`, speaker glyph swaps |
| Detents | 21 stops over 270° arc (−135°…+135°), 13.5° apart | Within ±4° of a detent the knob snaps: spring stiffness 900, damping 30 (tiny, ~90ms snap); tick marks (21 SVG ticks) light amber as passed |
| Tick feedback | On crossing a detent | 2ms 2kHz sine burst at −30dB via Web Audio (toggleable in settings; never blocks UI) |
| Value bubble | Appears after interaction stops | 200ms delay, fades in 150ms, shows `68%`; fades out 300ms after 1.2s idle |

**Code sketch (TSX)**

```tsx
// src/components/controls/DetentKnob.tsx
const DETENTS = 21, ARC = 270, START = -135;

export function DetentKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0); const startV = useRef(0);

  const render = (v: number) => {   // direct DOM: called from any gesture
    const deg = START + (v / 100) * ARC;
    knobRef.current?.style.setProperty('--k-rot', `${deg}deg`);
    knobRef.current?.style.setProperty('--k-arc', `${(v / 100) * ARC}deg`);
  };
  useEffect(() => render(value), [value]);

  const commit = (v: number) => {
    const snapped = Math.round(v / 5) * 5;          // 21 detents
    if (snapped !== value) tick();                   // 2ms tick, Web Audio
    onChange(Math.max(0, Math.min(100, snapped)));
  };

  return (
    <div ref={knobRef} className="knob" role="slider" aria-valuenow={value}
      tabIndex={0}
      onPointerDown={e => { dragY.current = e.clientY; startV.current = value;
        (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={e => e.buttons && commit(startV.current + (dragY.current - e.clientY) / 150 * 100)}
      onWheel={e => commit(value + (e.shiftKey ? 1 : 5) * (e.deltaY < 0 ? 1 : -1))}
      onDoubleClick={() => onChange(value === 0 ? 75 : 0)}
      onKeyDown={e => { /* arrows ±5 / shift ±1, Home/End, Alt handled in commit */ }}>
      <svg className="knob-ticks" viewBox="0 0 72 72">
        {Array.from({ length: DETENTS }).map((_, i) => {
          const a = (START + i * (ARC / (DETENTS - 1))) * Math.PI / 180;
          return <line key={i} x1={36 + 30 * Math.cos(a)} y1={36 + 30 * Math.sin(a)}
                       x2={36 + 33 * Math.cos(a)} y2={36 + 33 * Math.sin(a)}
                       className={i <= value / 5 ? 'tick on' : 'tick'} />;
        })}
      </svg>
      <div className="knob-body"><span className="knob-pointer" /></div>
      <div className="knob-arc" />   {/* conic-gradient amber arc via --k-arc */}
      <span className="knob-bubble">{value}%</span>
    </div>
  );
}
```

```css
.knob { width:72px; height:72px; touch-action:none; }
.knob-body { transform: rotate(var(--k-rot, -135deg)); will-change: transform;
  background: radial-gradient(circle at 35% 30%, #2a2e38, #14161c 70%);
  border:1px solid rgba(255,255,255,.08); box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 8px 24px rgba(0,0,0,.5); }
.knob-arc { background: conic-gradient(from 225deg, var(--amber) 0 var(--k-arc, 0deg), transparent 0); }
.tick { stroke:#3a3f4b; stroke-width:1.5; } .tick.on { stroke:var(--amber); }
.knob-bubble { opacity:0; transition: opacity 150ms var(--ease-out); }
.knob:focus-visible .knob-bubble, .knob:active .knob-bubble { opacity:1; }
```

**References**
- https://github.com/slipmatio/control-knob/blob/HEAD/README.md — knob interaction canon: vertical drag, Shift = precise, wheel steps, Alt-click reset to default, full keyboard map
- https://DEV.to/ndesmic/how-to-make-a-rotational-knob-input-with-web-components-43e3 — SVG tick ring + GPU-accelerated CSS `rotate()` for the dial hand

---

## 3. SpinSeek — inertial vinyl time-travel

**Concept:** Hover the vinyl and roll the mouse wheel: the record spins up with real inertia, and the audio bends in pitch exactly like a finger on wax — flick forward to fast-forward through a track with the classic vinyl warble, flick back to rewind. Release and it settles back to 33⅓ RPM with a spring.

**Why it fits Nocturne:** It makes the 33⅓ RPM vinyl *playable*, not decorative. It is the single most "analog feel" interaction in the set, costs no new UI chrome (the vinyl is already on stage), and gives keyboard-free, eyes-free coarse navigation — a genuine ease-of-use win for long tracks and DJ-style browsing.

**Interaction spec**

| Phase | Trigger / behavior | Values |
|---|---|---|
| Arm | Pointer hovers the vinyl disc | Ring cursor changes to `ew-resize`-ish grab; a faint amber "scrub hint" arc fades in (150ms) showing the active zone |
| Spin | Wheel `deltaY` adds angular velocity | `ω += -deltaY * 0.9` (°/s); direct-set `--vinyl-rot` in rAF; vinyl highlight streak stretches with ω (motion-blur illusion via a conic-gradient overlay whose opacity = min(1, ω/900)) |
| Inertia | No wheel input for >80ms | `ω *= exp(-dt/0.35)` (τ = 350ms decay); rotation integrates `rot += ω·dt` |
| Audio bend | While \|ω − 200°/s\| > 60°/s | `playbackRate = clamp(ω / 200, 0.25, 4)` — pitch follows speed exactly like resampled analog scrub; position accumulates `t += (rate−1)·dt` |
| Settle | ω within ±20°/s of 200°/s for 300ms | `playbackRate` springs  → 1.0 over 400ms `--ease-out`; ω eases → 200°/s; lyrics highlight re-locks (was dimmed to 40% during scrub) |
| Readout | Mini-player pill | Speed badge appears: `×2.5` amber mono text; hides 500ms after settle |
| Reverse flick | ω < 0 (backward) | Browsers can't do negative `playbackRate`: pause audio, show rewind shimmer on vinyl (amber sweep, 300ms), seek backward at `\|ω\|/200` rate, resume at 1.0 on settle |

Perf notes: one rAF loop, updates one CSS var + `audio.playbackRate` (cheap property, no re-render); `AnalyserNode` not needed here. Cap ω at ±2400°/s to avoid `playbackRate` clamp thrash.

**Code sketch (TSX)**

```tsx
// src/components/stage/useSpinScrub.ts
const IDLE_RPM_DEG = 200; // 33⅓ RPM = 200°/s

export function useSpinScrub(audio: HTMLAudioElement, vinylRef: RefObject<HTMLElement>) {
  const st = useRef({ w: IDLE_RPM_DEG, rot: 0, last: 0, scrubbing: false });
  const raf = useRef(0);

  const loop = (t: number) => {
    const s = st.current, dt = Math.min(0.05, (t - s.last) / 1000); s.last = t;
    if (!s.scrubbing) s.w += (IDLE_RPM_DEG - s.w) * (1 - Math.exp(-dt / 0.35)); // inertia
    s.rot = (s.rot + s.w * dt) % 360;
    vinylRef.current?.style.setProperty('--vinyl-rot', `${s.rot}deg`);

    const rate = s.w < 0 ? 0 : Math.max(0.25, Math.min(4, s.w / IDLE_RPM_DEG));
    if (Math.abs(s.w - IDLE_RPM_DEG) > 60) {
      if (s.w >= 0) { audio.playbackRate = rate; }
      else if (!audio.paused) { audio.pause(); }                    // rewind: seek
      if (s.w < 0) audio.currentTime = Math.max(0, audio.currentTime + (s.w / IDLE_RPM_DEG) * dt);
      setScrubBadge(s.w >= 0 ? `×${rate.toFixed(1)}` : '◀◀');
      s.scrubbing = true;
    } else if (s.scrubbing && Math.abs(s.w - IDLE_RPM_DEG) < 20) {
      // settled: glide rate back to 1.0
      audio.playbackRate = 1; if (audio.paused && s.w >= 0) audio.play();
      s.scrubbing = false; hideScrubBadge();
    }
    raf.current = requestAnimationFrame(loop);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const s = st.current;
    s.w = Math.max(-2400, Math.min(2400, s.w - e.deltaY * 0.9));
    s.scrubbing = true;
  };

  useEffect(() => { st.current.last = performance.now();
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current); }, []);
  return { onWheel };
}
```

**References**
- https://en.wikipedia.org/wiki/Scrubbing_(audio) — resampling playback at arbitrary rates pitch-shifts the audio, "approximating the effect of playing audio from an analog source like tape or vinyl with a similarly varying motion" — the exact effect this recreates
- https://github.com/status201/vast-websynth/blob/HEAD/specs/features/scratch.md — turntable gesture model: speed, pitch and direction moving together as one printed gesture

---

## 4. Amber Breath — the app inhales the music

**Concept:** A slow, audio-reactive amber aura behind the stage island and inside the Dynamic Island mini-player: bass swells its radius, mids feed its brightness, each kick drum lands a soft 60ms pulse. When music pauses, the glow doesn't die — it settles into a 6-second idle breathing rhythm, like the app is asleep but alive.

**Why it fits Nocturne:** Glass islands on a transparent window only read as "glass" when light moves across them. A static UI on a transparent window looks dead; a breathing amber aura makes the Obsidian background feel like a room with a lamp in it. It also unifies the two hero surfaces (stage + mini-player) with one shared signal, and it reuses the spectrum pipeline already researched for the mini-player.

**Interaction spec**

| Signal | Source | Mapping |
|---|---|---|
| Bass energy | AnalyserNode fftSize 2048, bins 20–250Hz RMS | Glow radius: `320 + 160 × bass` px |
| Mid energy | bins 250Hz–4kHz RMS | Glow opacity: `0.25 + 0.75 × mid` |
| Treble / centroid | bins 4k–20kHz | Amber hue drift ±6° (warm ↔ hot) |
| Beat | bass > 1.35 × rolling average + 250ms cooldown | 60ms kick: glow `scale` 1.00 → 1.03, exponential decay τ = 180ms |
| Smoothing | EMA asymmetric | attack α = 0.5, release α = 0.08 (fast to rise, slow to fall — no flicker) |
| Idle | No audio for 2s | Crossfade 800ms to 6s sine breathing at 30% opacity |
| Reduced motion / battery saver | `prefers-reduced-motion` or toggle | Static 30% glow; rAF loop stopped entirely |

Perf contract: **one** rAF loop, writes 4 CSS vars (`--glow-r`, `--glow-o`, `--glow-h`, `--glow-s`) on two pre-reffed elements; zero React state updates per frame; the glow element is a plain `radial-gradient` div with `will-change: transform, opacity` — no `backdrop-filter` or CSS `blur()` on the animated layer (falloff baked into the gradient = free). Audio→visual latency < 16ms (one frame). When silent ≥ 2s, loop drops to a 6s CSS keyframe animation and the JS loop sleeps.

**Code sketch (TSX)**

```tsx
// src/components/ambient/AmberBreath.tsx
export function AmberBreath({ analyser, playing }: { analyser: AnalyserNode | null; playing: boolean }) {
  const glowRef = useRef<HTMLDivElement>(null);
  const st = useRef({ bass: 0, mid: 0, treb: 0, avg: 0, cool: 0, idle: 0 });

  useEffect(() => {
    if (!analyser) return;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const loop = (t: number) => {
      analyser.getByteFrequencyData(bins);
      const band = (lo: number, hi: number) => {           // lo/hi in Hz
        const sr = analyser.context.sampleRate / 2, n = bins.length;
        const a = Math.floor(lo / sr * n), b = Math.ceil(hi / sr * n);
        let s = 0; for (let i = a; i < b; i++) s += bins[i] * bins[i];
        return Math.sqrt(s / (b - a)) / 255;
      };
      const s = st.current;
      const b = band(20, 250), m = band(250, 4000), tr = band(4000, 20000);
      const ema = (old: number, v: number) => old + (v > old ? 0.5 : 0.08) * (v - old);
      s.bass = ema(s.bass, b); s.mid = ema(s.mid, m); s.treb = ema(s.treb, tr);
      s.avg = s.avg + 0.02 * (b - s.avg);
      let kick = 0;
      if (b > s.avg * 1.35 && t - s.cool > 250) { s.cool = t; kick = 1; }
      const g = glowRef.current!;
      g.style.setProperty('--glow-r', `${320 + 160 * s.bass}px`);
      g.style.setProperty('--glow-o', `${0.25 + 0.75 * s.mid}`);
      g.style.setProperty('--glow-h', `${42 + 6 * (s.treb - 0.5) * 2}deg`);
      if (kick) g.animate(
        [{ transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
        { duration: 180, easing: 'cubic-bezier(0.23,1,0.32,1)' });  // WAAPI, compositor-only
      raf = requestAnimationFrame(loop);
    };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return <div ref={glowRef} className={`amber-breath ${playing ? '' : 'idle'}`} aria-hidden />;
}
```

```css
.amber-breath {
  position: absolute; inset: auto; width: var(--glow-r, 320px); height: var(--glow-r, 320px);
  background: radial-gradient(circle, hsla(var(--glow-h, 42deg), 95%, 55%, var(--glow-o, .3)) 0%, transparent 70%);
  will-change: transform, opacity; pointer-events: none;
}
.amber-breath.idle { animation: breathe 6s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .18; transform: scale(.96); } }
```

**References**
- https://github.com/hyperb1iss/hypercolor/blob/HEAD/docs/design/02-effect-system.md — audio-reactive effect taxonomy: beat pulse = brightness spike with exponential decay; EMA smoothing to prevent flicker; <16ms audio-to-visual latency; degrade gracefully to a static ambient state when silent
- https://github.com/mengxi-ream/read-frog/blob/HEAD/.agents/skills/review-animations/STANDARDS.md — duration/easing budget (UI under 300ms; iOS-like `cubic-bezier(0.32,0.72,0,1)`); decorative motion should interpolate through springs rather than bind directly to input

---

## 5. Magnetic Queue — the playlist that snaps

**Concept:** Reorder the up-next queue by dragging rows that behave like magnets: the dragged row lifts with a soft shadow, siblings glide aside on springs, and when you hover a gap, the neighboring rows lean 6px toward the dragged row as if pulled — release and the row snaps into the slot with a barely-there overshoot, the index chip flashing amber once to confirm.

**Why it fits Nocturne:** Queue management is the highest-friction daily task in any player and usually the least loved. This makes it the most *fun* — and the spring language (`useSpring`, stiffness ≈ 400–500) is the same DNA as the Dynamic Island mini-player, so the whole app starts to feel like one physical material.

**Interaction spec**

| Phase | Trigger / behavior | Values |
|---|---|---|
| Lift | `pointerdown` + 6px move (or 350ms long-press for touch) | Row lifts: `scale(1.02)`, shadow `0 12px 32px rgba(0,0,0,.45)`, 120ms `--ease-out`; others dim to 85% |
| Drag | Pointer moves | Row follows pointer with spring (stiffness 400, damping 32) — slight lag = weight; `cursor: grabbing` |
| Magnetic hint | Dragged center within 18px of a slot | Adjacent rows shift 6px toward the dragged row (spring 500/40, ~80ms) — the "pull"; target slot shows 2px amber insertion line fading in 150ms |
| Sibling shift | Dragged crosses a row's midpoint | FLIP: siblings animate to new positions, spring stiffness 400, damping 32 (no layout thrash — transforms only) |
| Edge auto-scroll | Hover within 24px of list edge > 400ms | Scroll 60px/s |
| Drop | `pointerup` | Row snaps to slot: spring stiffness 500, damping 30, overshoot ≈ 4px then settle (~250ms); index chip flashes amber 300ms; order commits to Zustand *after* animation starts (optimistic, rollback on error) |
| Cancel | Esc | Row springs home (stiffness 300, damping 28); order unchanged |

Hand-rolled with Pointer Events + FLIP — ~90 lines, no dnd-kit needed (dnd-kit is fine too, but the anti-lag rule favors the 90-line version and identical feel).

**Code sketch (TSX)**

```tsx
// src/components/queue/MagneticQueue.tsx (core logic sketch)
export function MagneticQueue({ items, onReorder }: { items: Track[]; onReorder: (t: Track[]) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; y: number; el: HTMLElement } | null>(null);

  const rowY = (el: HTMLElement) => el.offsetTop;   // measured once per dragstart

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const rows = [...listRef.current!.children] as HTMLElement[];
    const over = rows.findIndex(r => e.clientY < rowY(r) + r.offsetHeight / 2);
    rows.forEach((r, i) => {
      if (r === d.el) { r.style.transform = `translateY(${e.clientY - d.y}px) scale(1.02)`; return; }
      const targetIdx = over === -1 ? rows.length - 1 : over;
      const shift = (i >= targetIdx && rows.indexOf(d.el) < targetIdx) ? -d.el.offsetHeight
                  : (i < targetIdx && rows.indexOf(d.el) >= targetIdx) ? d.el.offsetHeight : 0;
      // magnetic pull: neighbors lean 6px toward the dragged row near the slot
      const near = Math.abs(i - targetIdx) === 1 ? Math.sign(e.clientY - (rowY(r) + 18)) * 6 : 0;
      springTo(r, shift + near);   // per-row useSpring(stiffness 400, damping 32) writing transform
    });
  };

  const onPointerUp = () => {
    const d = drag.current; if (!d) return;
    // compute new order from final transforms, commit optimistically
    const rows = [...listRef.current!.children] as HTMLElement[];
    const order = rows.slice().sort((a, b) =>
      (parseFloat(a.dataset.slot!) ) - parseFloat(b.dataset.slot!));
    onReorder(order.map(r => items.find(t => t.id === r.dataset.id)!));
    springTo(d.el, 0, { stiffness: 500, damping: 30 });  // snap with ~4px overshoot
    flashChip(d.el);
    drag.current = null;
  };
  /* …pointerdown starts drag after 6px movement threshold… */
}
```

**References**
- https://dev.to/hexshift/how-to-create-physics-based-spring-animations-with-custom-damping-in-javascript-1e08 — hand-rolled spring physics (Hooke's law + damping, rAF, no library) — the exact technique `springTo` uses per row
- https://github.com/mengxi-ream/read-frog/blob/HEAD/.agents/skills/review-animations/STANDARDS.md — Apple-style spring (`duration 0.5, bounce 0.2`); keep bounce subtle, reserve overshoot for drag-to-dismiss-style playful drops; interruptible springs preserve gesture velocity

---

## 6. Comparison & build order

| # | Idea | Wow factor | Implementation cost | Perf risk | Notes |
|---|---|---|---|---|---|
| 1 | NeedleDrop (tonearm seek) | ★★★★★ | Medium (hit-testing + ripple + seek map) | Low (one spring + class toggles) | Signature ritual; marketable in screenshots |
| 2 | Detent Knob (volume) | ★★★★ | Low (self-contained component) | Very low (CSS vars, no loop) | Daily-use control; build first as the motion-language reference |
| 3 | SpinSeek (inertial scrub) | ★★★★★ | Medium (rAF loop + playbackRate edge cases) | Low–Medium (test on HDD-loaded tracks; clamp ω) | Most "analog"; needs real-device tuning |
| 4 | Amber Breath (audio glow) | ★★★★ | Low–Medium (AnalyserNode wiring) | Low if done right (2 elements, CSS vars, gradient falloff — never `blur()`) | Biggest visual payoff per line of code; toggleable |
| 5 | Magnetic Queue (reorder) | ★★★★ | Medium–High (FLIP bookkeeping, edge scroll, Esc) | Low (transforms only) | Highest state complexity; build last |

**Recommended build order:** **2 → 4 → 1 → 3 → 5**
1. **Detent Knob** — establishes the spring/easing language and is exercised every session; lowest risk.
2. **Amber Breath** — pure visual, zero playback-logic changes, instantly makes the transparent window feel alive; validates the AnalyserNode pipeline the mini-player research already specified.
3. **NeedleDrop** — the signature analog gesture; moderate complexity, huge identity payoff.
4. **SpinSeek** — builds on the vinyl work from (3); needs playbackRate/rewind edge-case testing on real files.
5. **Magnetic Queue** — most logic, least coupled to the others; safe to schedule last.

Total new dependencies: **zero**. Everything runs through `useSpring` (§0) + one rAF loop each for SpinSeek and Amber Breath (both sleep when idle).

---

## 7. Honorable mentions (cut for scope, worth a second pass)

- **Sunset Sleep Timer** — sleep timer that doesn't just stop audio: over the final 10 minutes the amber glow desaturates toward deep blue, glass islands dim 60%, and volume fades with an exponential curve. Cheap (one timer + existing tokens), very "luxury hotel" energy.
- **Hold-`?` Shortcut Atlas** — hold `?` (or the existing shortcut key) for 600ms → a glass cheat-sheet island fades in listing all keyboard shortcuts, keys highlighted amber as you press them. Directly serves the "keyboard shortcuts" feature already in the brief.
- **Droplet Import** — drag audio files onto the window: the drop zone opens like a liquid droplet (the mini-player's entry language), files get "absorbed" with a ripple per file, then a spring-settled toast confirms the count. Reuses the Dynamic Island liquid language for a cohesive feel.

---

## 8. Reference index (all URLs verified via live search/fetch)

- Motion tokens & budgets — https://github.com/mengxi-ream/read-frog/blob/HEAD/.agents/skills/review-animations/STANDARDS.md
- Micro-interaction timing & states — https://github.com/jnotsknab/mux-swarm/blob/HEAD/Skills/bundled/ux-ui/SKILL.md
- iOS spring choreography (response 0.35 / dampingFraction 0.75) — https://github.com/fayazara/screendrop/blob/HEAD/.agents/skills/macos-notch-ui/SKILL.md
- Hand-rolled spring physics tutorial — https://dev.to/hexshift/how-to-create-physics-based-spring-animations-with-custom-damping-in-javascript-1e08
- Knob interaction conventions — https://github.com/slipmatio/control-knob/blob/HEAD/README.md
- Knob SVG + GPU rotation — https://DEV.to/ndesmic/how-to-make-a-rotational-knob-input-with-web-components-43e3
- Digital Turntable tonearm ritual (Behance) — https://www.behance.net/gallery/237278785/Digital-Turntable-Spotify-Vinyl-Design
- Audio scrubbing / resampling ≈ vinyl — https://en.wikipedia.org/wiki/Scrubbing_(audio)
- Turntable scratch gesture model — https://github.com/status201/vast-websynth/blob/HEAD/specs/features/scratch.md
- Audio-reactive effect system (beat decay, EMA, latency) — https://github.com/hyperb1iss/hypercolor/blob/HEAD/docs/design/02-effect-system.md
