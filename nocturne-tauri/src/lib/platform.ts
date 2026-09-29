/**
 * Platform detection for modifier-key and layout differences.
 *
 * NOCTURNE_RULE: every value produced here is used behind a platform branch, and
 * the non-macOS return values are the literals that were already hardcoded in the
 * Windows build. Windows output is therefore unchanged by construction.
 *
 * Detection is a one-time read at module load (the user agent cannot change
 * during a session) so callers never pay for a per-event string scan, and so a
 * value captured once inside a React render can never flip between renders.
 */

function detectMacOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  // userAgentData.platform is Chromium-only, so it is a fast path on Windows
  // and absent on macOS. Fall through to the user agent for WKWebView.
  if (typeof nav.userAgentData?.platform === 'string') {
    return nav.userAgentData.platform.toLowerCase().includes('mac')
  }
  return nav.userAgent.toLowerCase().includes('mac')
}

/** True on macOS (WKWebView), false on Windows and every other platform. */
export const IS_MACOS: boolean = detectMacOS()

/**
 * The primary modifier label for this platform: '⌘' on macOS, 'Ctrl'
 * everywhere else. The non-macOS value is the exact string the Windows build
 * has always displayed.
 */
export function modKey(): string {
  return IS_MACOS ? '⌘' : 'Ctrl'
}
