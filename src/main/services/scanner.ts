import { opendir } from 'fs/promises'
import { resolve } from 'path'
import type { ScanProgress, ScanResult } from '../../shared/api'
import { getDb } from './db'
import {
  isSupportedFile,
  isUnsupportedAudio,
  readTrackMetadata,
  type TrackDraft
} from './metadata'

const BATCH_SIZE = 50
const PROGRESS_INTERVAL_MS = 250 // 4Hz max
const MAX_FOLDERS_PER_SCAN = 64

let cancelRequested = false

export function requestScanCancel(): void {
  cancelRequested = true
}

function yieldToLoop(): Promise<void> {
  return new Promise((res) => setImmediate(res))
}

/** Recursive walk with plain fs/path only. Returns supported files + unsupported-audio count. */
async function walkFolder(root: string, onProgress: (p: ScanProgress) => void): Promise<{ files: string[]; skippedUnsupported: number }> {
  const files: string[] = []
  let skippedUnsupported = 0
  let visited = 0
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let handle
    try {
      handle = await opendir(dir)
    } catch {
      continue // unreadable dir: skip, never crash the scan
    }
    for await (const entry of handle) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) stack.push(full)
      } else if (entry.isFile()) {
        if (isSupportedFile(full)) {
          files.push(full)
        } else if (isUnsupportedAudio(full)) {
          skippedUnsupported += 1
        }
      }
      visited += 1
      if (visited % 256 === 0) {
        onProgress({ phase: 'walk', scanned: 0, total: 0, skippedUnsupported, errors: 0 })
        await yieldToLoop()
      }
      if (cancelRequested) return { files, skippedUnsupported }
    }
  }
  return { files, skippedUnsupported }
}

const UPSERT_SQL = `
INSERT INTO tracks (
  filePath, folderId, title, artist, album, albumArtist, genre, year, trackNo, discNo,
  durationSec, bitrate, sampleRate, channels, fileSizeBytes, mtimeMs,
  lrcPath, hasEmbeddedLyrics, lyricSource, missing, lastError, dateAdded, lastSeenAt, lastPlayedAt
) VALUES (
  @filePath, @folderId, @title, @artist, @album, @albumArtist, @genre, @year, @trackNo, @discNo,
  @durationSec, @bitrate, @sampleRate, @channels, @fileSizeBytes, @mtimeMs,
  @lrcPath, @hasEmbeddedLyrics, @lyricSource, 0, @lastError, @now, @now, NULL
)
ON CONFLICT(filePath) DO UPDATE SET
  folderId = excluded.folderId,
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  albumArtist = excluded.albumArtist,
  genre = excluded.genre,
  year = excluded.year,
  trackNo = excluded.trackNo,
  discNo = excluded.discNo,
  durationSec = excluded.durationSec,
  bitrate = excluded.bitrate,
  sampleRate = excluded.sampleRate,
  channels = excluded.channels,
  fileSizeBytes = excluded.fileSizeBytes,
  mtimeMs = excluded.mtimeMs,
  lrcPath = excluded.lrcPath,
  hasEmbeddedLyrics = excluded.hasEmbeddedLyrics,
  lyricSource = excluded.lyricSource,
  missing = 0,
  lastError = excluded.lastError,
  lastSeenAt = excluded.lastSeenAt
`

/**
 * Incremental rescan of registered folders (or an explicit list).
 * Skips re-parse when mtimeMs is unchanged. Marks vanished files missing=1.
 */
export async function scanLibraryFolders(options?: {
  folderPaths?: string[]
  onProgress?: (p: ScanProgress) => void
}): Promise<ScanResult> {
  cancelRequested = false
  const db = getDb()
  const emit = options?.onProgress ?? ((): void => undefined)
  const throttledEmit = (p: ScanProgress): void => {
    const now = Date.now()
    if (now - lastEmit >= PROGRESS_INTERVAL_MS || p.scanned >= p.total) {
      lastEmit = now
      emit(p)
    }
  }
  let lastEmit = 0

  let roots = (options?.folderPaths ?? []).map((p) => resolve(p)).filter((p) => p.length > 0)
  if (roots.length === 0) {
    const rows = db.prepare('SELECT folderPath FROM folders WHERE enabled = 1').all() as { folderPath: string }[]
    roots = rows.map((r) => r.folderPath)
  }
  roots = [...new Set(roots)].slice(0, MAX_FOLDERS_PER_SCAN)
  const scanStart = Date.now()
  const now = scanStart

  const upsertFolder = db.prepare(
    'INSERT OR IGNORE INTO folders (folderPath, dateAdded, enabled) VALUES (?, ?, 1)'
  )
  const getFolderId = db.prepare('SELECT id FROM folders WHERE folderPath = ?')
  const touchFolder = db.prepare('UPDATE folders SET lastScannedAt = ? WHERE id = ?')
  const existingStmt = db.prepare('SELECT mtimeMs, missing, lrcPath FROM tracks WHERE filePath = ?')
  const touchSeen = db.prepare('UPDATE tracks SET lastSeenAt = ?, missing = 0 WHERE filePath = ?')
  const upsert = db.prepare(UPSERT_SQL)
  const upsertBatch = db.transaction((batch: { draft: TrackDraft; folderId: number | null }[]) => {
    for (const { draft, folderId } of batch) {
      upsert.run({ ...draft, folderId, now })
    }
  })

  let addedOrUpdated = 0
  let skippedUnsupported = 0
  let errors = 0
  const folderIds: number[] = []

  for (const root of roots) {
    if (cancelRequested) break
    upsertFolder.run(root, now)
    const folderRow = getFolderId.get(root) as { id: number } | undefined
    if (!folderRow) continue
    folderIds.push(folderRow.id)

    const { files, skippedUnsupported: skipped } = await walkFolder(root, emit)
    skippedUnsupported += skipped
    if (cancelRequested) break

    let batch: { draft: TrackDraft; folderId: number | null }[] = []
    let scanned = 0
    for (const file of files) {
      if (cancelRequested) break
      scanned += 1
      let existing: { mtimeMs: number | null; missing: number; lrcPath: string | null } | undefined
      try {
        existing = existingStmt.get(file) as typeof existing
      } catch {
        errors += 1
        continue
      }
      let draft: TrackDraft
      try {
        const statDraft = await readTrackMetadata(file)
        // Fast path: unchanged file (same mtime + same sidecar state) → touch lastSeen only.
        // A newly added/removed .lrc still triggers a re-parse via the lrcPath comparison.
        if (
          existing &&
          existing.mtimeMs !== null &&
          statDraft.mtimeMs === existing.mtimeMs &&
          existing.missing === 0 &&
          (existing.lrcPath ?? null) === (statDraft.lrcPath ?? null)
        ) {
          touchSeen.run(now, file)
        } else {
          draft = statDraft
          batch.push({ draft, folderId: folderRow.id })
          if (batch.length >= BATCH_SIZE) {
            upsertBatch(batch)
            addedOrUpdated += batch.length
            batch = []
          }
        }
      } catch {
        errors += 1
      }
      throttledEmit({ phase: 'parse', scanned, total: files.length, skippedUnsupported, errors })
      if (scanned % 25 === 0) await yieldToLoop()
    }
    if (batch.length > 0 && !cancelRequested) {
      upsertBatch(batch)
      addedOrUpdated += batch.length
    }
    emit({ phase: 'parse', scanned, total: files.length, skippedUnsupported, errors })
    touchFolder.run(now, folderRow.id)
  }

  if (!cancelRequested && folderIds.length > 0) {
    const placeholders = folderIds.map(() => '?').join(',')
    db.prepare(`UPDATE tracks SET missing = 1 WHERE folderId IN (${placeholders}) AND lastSeenAt < ? AND missing = 0`).run(
      ...folderIds,
      scanStart
    )
  }

  return { addedOrUpdated, skippedUnsupported, errors, cancelled: cancelRequested }
}
