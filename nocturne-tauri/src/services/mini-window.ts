// P0 idle-CPU: the mini-island window is NO LONGER declared in
// tauri.conf.json. A hidden-but-resident WebView2 renderer kept running at
// ~18% CPU forever (measured, PERFORMANCE_AUDIT_REPORT.md / Experiment 0), so
// the window is now created on demand from the main window and DESTROYED the
// moment the main window is restored — zero windows means zero renderers.
//
// This module is the single source of truth for "does a mini-island window
// exist right now". App.tsx owns the lifecycle and publishes the handle here;
// usePlayerStore's broadcastState() reads it to skip the BroadcastChannel
// fan-out entirely while no mini is listening.
//
// A dedicated module (rather than exporting the handle from App.tsx) is what
// keeps the dependency graph acyclic: App.tsx already imports the store, so
// the store must never import App.tsx.

import type { WebviewWindow } from '@tauri-apps/api/webviewWindow'

let miniWindow: WebviewWindow | null = null

/** Current mini-island window handle, or null when the window does not exist. */
export function getMiniWindow(): WebviewWindow | null {
  return miniWindow
}

/**
 * Publish the live mini-island handle. Passing `null` (window destroyed /
 * not created yet) is what gates the state fan-out.
 */
export function setMiniWindow(handle: WebviewWindow | null): void {
  miniWindow = handle
}

/** True when a mini-island window currently exists. */
export function hasMiniWindow(): boolean {
  return miniWindow !== null
}
