import { net, protocol } from 'electron'
import { statSync } from 'fs'
import { extname, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { getDb } from '../services/db'
import { getCoversDir } from '../lib/paths'

export const SAFE_FILE_SCHEME = 'safe-file'
export const SAFE_FILE_PREFIX = 'safe-file://track/'

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
}

export function mimeForExt(filePath: string): string | undefined {
  return AUDIO_MIME[extname(filePath).toLowerCase()]
}

/**
 * Decode a renderer-built safe-file URL back to a canonical absolute path.
 * Returns null for anything malformed — never throws.
 */
export function decodeSafeFileUrl(url: string): string | null {
  if (!url.startsWith(SAFE_FILE_PREFIX)) return null
  const b64 = url.slice(SAFE_FILE_PREFIX.length)
  if (b64.length === 0 || b64.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(b64)) return null
  try {
    const decoded = Buffer.from(b64, 'base64url').toString('utf8')
    if (!decoded) return null
    return resolve(decoded)
  } catch {
    return null
  }
}

/** Pure allowlist check: supported audio ext + inside a music folder or the covers cache. */
export function isAllowedPath(canonicalPath: string, folderPaths: string[], coversDir: string): boolean {
  if (!mimeForExt(canonicalPath)) return false
  const lower = canonicalPath.toLowerCase()
  const inside = (dir: string): boolean => {
    const root = resolve(dir).toLowerCase()
    return lower === root || lower.startsWith(root.endsWith(sep) ? root : root + sep)
  }
  if (inside(coversDir)) return true
  return folderPaths.some(inside)
}

/** Serve validated local audio via the OS file loader (streaming + Range seeks). */
export function registerSafeFileProtocol(): void {
  protocol.handle(SAFE_FILE_SCHEME, async (request) => {
    try {
      const decoded = decodeSafeFileUrl(request.url)
      if (!decoded) return new Response('bad request', { status: 400 })
      const rows = getDb()
        .prepare('SELECT folderPath FROM folders WHERE enabled = 1')
        .all() as { folderPath: string }[]
      if (!isAllowedPath(decoded, rows.map((r) => r.folderPath), getCoversDir())) {
        return new Response('forbidden', { status: 403 })
      }
      let isFile = false
      try {
        isFile = statSync(decoded).isFile()
      } catch {
        return new Response('not found', { status: 404 })
      }
      if (!isFile) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(decoded).href)
    } catch {
      return new Response('internal error', { status: 500 })
    }
  })
}
