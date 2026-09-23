import { existsSync, statSync } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import { parseFile } from 'music-metadata'
import { SUPPORTED_EXTENSIONS } from '../../shared/constants'

const SUPPORTED = new Set<string>(SUPPORTED_EXTENSIONS as readonly string[])

/** Extensions counted as "unsupported audio" (skipped with a counter, never a crash). */
const UNSUPPORTED_AUDIO = new Set(['.flac', '.ogg', '.oga', '.opus', '.wma', '.aiff', '.aif', '.mka'])

export type LyricSource = 'sidecar-lrc' | 'embedded-synced' | 'embedded-unsynced' | 'none'

export interface TrackDraft {
  filePath: string
  title: string
  artist: string
  album: string
  albumArtist: string | null
  genre: string | null
  year: number | null
  trackNo: number | null
  discNo: number | null
  durationSec: number | null
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
  fileSizeBytes: number | null
  mtimeMs: number | null
  lrcPath: string | null
  hasEmbeddedLyrics: number
  lyricSource: LyricSource
  lastError: string | null
}

export function isSupportedFile(filePath: string): boolean {
  return SUPPORTED.has(extname(filePath).toLowerCase())
}

export function isUnsupportedAudio(filePath: string): boolean {
  return UNSUPPORTED_AUDIO.has(extname(filePath).toLowerCase())
}

function truncate(value: string | undefined, fallback: string): string {
  const text = (value ?? fallback).trim() || fallback
  return text.length > 500 ? text.slice(0, 500) : text
}

/** `Artist - Title.mp3` → split; otherwise filename becomes the title. */
export function fallbackFromFilename(filePath: string): { title: string; artist: string } {
  const base = basename(filePath, extname(filePath)).trim()
  const sep = base.indexOf(' - ')
  if (sep > 0) {
    const artist = base.slice(0, sep).trim() || 'Unknown Artist'
    const title = base.slice(sep + 3).trim() || base
    return { title, artist }
  }
  return { title: base || 'Unknown Title', artist: 'Unknown Artist' }
}

/** `Song.mp3` → `Song.lrc` next to it, else null. */
export function findSidecarLrc(filePath: string): string | null {
  const dir = dirname(filePath)
  const base = basename(filePath, extname(filePath))
  const candidate = resolve(join(dir, `${base}.lrc`))
  return existsSync(candidate) ? candidate : null
}

/**
 * Read one file's tags with pure-JS streaming parse.
 * Never throws for corrupt/untagged audio — falls back to filename.
 * Throws only if the file itself is unreadable (vanished, permissions).
 */
export async function readTrackMetadata(canonicalPath: string): Promise<TrackDraft> {
  const fallback = fallbackFromFilename(canonicalPath)
  const stat = statSync(canonicalPath)
  const draft: TrackDraft = {
    filePath: canonicalPath,
    title: fallback.title,
    artist: fallback.artist,
    album: 'Unknown Album',
    albumArtist: null,
    genre: null,
    year: null,
    trackNo: null,
    discNo: null,
    durationSec: null,
    bitrate: null,
    sampleRate: null,
    channels: null,
    fileSizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    lrcPath: findSidecarLrc(canonicalPath),
    hasEmbeddedLyrics: 0,
    lyricSource: 'none',
    lastError: null
  }

  try {
    const metadata = await parseFile(canonicalPath, { duration: true })
    const common = metadata.common
    const format = metadata.format
    draft.title = truncate(common.title, fallback.title)
    draft.artist = truncate(common.artist, fallback.artist)
    draft.album = truncate(common.album, 'Unknown Album')
    draft.albumArtist = common.albumartist ? truncate(common.albumartist, '') || null : null
    draft.genre = common.genre?.[0] ? truncate(common.genre[0], '') || null : null
    draft.year = common.year ?? null
    draft.trackNo = common.track.no ?? null
    draft.discNo = common.disk.no ?? null
    draft.durationSec = format.duration ?? null
    draft.bitrate = format.bitrate ? Math.round(format.bitrate / 1000) : null
    draft.sampleRate = format.sampleRate ?? null
    draft.channels = (format as { numberOfChannels?: number }).numberOfChannels ?? null
    if (common.lyrics && common.lyrics.length > 0) {
      draft.hasEmbeddedLyrics = 1
      draft.lyricSource = 'embedded-unsynced'
    }
  } catch {
    // Corrupt or unreadable tags: keep filename fallback, flag the row.
    draft.lastError = 'corrupt'
  }

  if (draft.lrcPath) draft.lyricSource = 'sidecar-lrc'
  return draft
}
