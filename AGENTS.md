# AGENTS.md — Nocturne (Tauri Edition)

> Offline-first minimal dark Windows music player. Single local user. No cloud. No login. No server. This file is the agent contract. It overrides generic defaults. Read it before any task.

1. Mission & MVP Boundaries (Non-Negotiable)
---------------------------------------------
**Mission:** Tiny, beautiful, ultra-lightweight instant offline player for owned MP3/WAV/M4A files with cover art + synced local lyrics.
- Final installer size target: ~10-15 MB (Tauri native shell).
- In MVP: Folder scan, SQLite cache, tracklist (search/sort), playback engine, local lyrics sync (.lrc / embedded tags), Nocturne dark theme.
- Out MVP: Cloud sync, streaming, online lyrics, tag editing, DSP/equalizer, light mode.

2. Tech Stack (Locked)
-----------------------
- Core: Tauri v2 + Rust (Native desktop shell, audio backend/IPC)
- Frontend: Vite + React 18 + TypeScript + TailwindCSS 3.4 + Zustand
- Database: Local SQLite (managed safely via Rust backend or lightweight client)
- Audio: webview HTMLAudioElement only — no custom Rust decode pipelines in MVP.
- SQLite crate: chosen at the DB step. Ask before adding any crate.
- Toolchain (required): Rust stable + MSVC Build Tools + WebView2 runtime.
- Forbidden: Electron, Python, Docker, Prisma, cloud frameworks, online fetch.

3. Canonical Commands
----------------------
All commands run inside `nocturne-tauri/` (the active app). Requires Rust stable + MSVC Build Tools + WebView2.
- npm install         # Frontend deps only (no cargo involvement)
- npm run tauri dev   # Run Tauri development desktop window
- npm run tauri build # Build production lightweight Windows .msi / .exe

4. Directory Layout
--------------------
- nocturne-tauri/       # ACTIVE Tauri app (all new work goes here)
- nocturne-tauri/src-tauri/  # Rust backend: main.rs, commands, IPC, SQLite, tauri.conf.json
- nocturne-tauri/src/   # React frontend: components, stores, hooks, styles
- nocturne-tauri/src/shared/ # Shared types and contracts (dependency-free)
- Root-level Electron files (package.json, src/, out/, electron-vite.config.ts) are FROZEN LEGACY from a superseded prototype. Do not extend, do not wire into Tauri, do not delete without explicit owner approval.

5. Theme & Palette
-------------------
- Base: #0A0B0E | Surface: #121419 | Raised: #1A1E27
- Borders: #232936 / #2E3648
- Text: #F2F3F5 (bone) | Muted: #A8B0BE | Faint: #6B7484
- Accent: #EAB308 (ember gold)
- Strictly no purple gradients.

6. Boundaries (Non-Negotiable)
------------------------------
- No networking: no fetch to remote hosts, no online lyrics, no telemetry, no auto-update server in MVP.
- Backend owns disk & DB: frontend reaches files/SQLite only via Tauri `invoke` commands on an explicit allowlist. Never expose raw fs/sql to the webview.
- Validate every path in Rust (canonicalize, reject `..` escapes, allowlist music folders + asset cache).
- No custom audio decode pipelines (no symphonia/rodio decode graphs in MVP).
- Ask before adding any crate or any npm dependency beyond the scaffold set.
- Never claim a window "verified" from a headless log alone — report exactly what was observed.

7. Engineering Discipline & Precedence
--------------------------------------
- Evidence before synthesis: read files, run typecheck/build, inspect before claiming.
- Verify by execution: `npm run tauri dev` smoke (boot → empty state, no errors) after every scaffold-level change.
- One in-progress task at a time; no destructive actions (no force-push, no deleting legacy trees, no commits unless asked).
- Precedence: safety/no-net guarantees > MVP scope > architecture/IPC rules > theme > convenience. On conflict, stop and ask.