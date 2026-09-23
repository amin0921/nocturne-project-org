import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * Resolves a local cached image file path or existing URI into a browser-loadable URL.
 * Converts local filesystem paths via Tauri's native convertFileSrc asset protocol.
 */
export function resolveCoverUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return undefined
  const trimmed = pathOrUrl.trim()
  if (!trimmed) return undefined
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('asset://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed
  }
  try {
    return convertFileSrc(trimmed)
  } catch {
    return trimmed
  }
}
