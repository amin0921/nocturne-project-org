import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * Absolute file path → native asset URL (`http://asset.localhost/...`).
 * Served by Tauri's built-in asset protocol with Range-seek support, so the
 * WebView2 media pipeline accepts it (custom schemes get ERR_UNKNOWN_URL_SCHEME).
 * Only ever called with DB-catalogued paths — never raw user input.
 */
export function toAudioUrl(filePath: string): string {
  return convertFileSrc(filePath)
}
