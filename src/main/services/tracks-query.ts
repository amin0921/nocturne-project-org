import type { TrackListItem, TrackSortBy, TracksListParams, TracksListResult } from '../../shared/api'
import { getDb } from './db'

const SORT_COLUMNS: Record<TrackSortBy, string> = {
  title: 't.title',
  artist: 't.artist',
  album: 't.album',
  durationSec: 't.durationSec',
  dateAdded: 't.dateAdded'
}

const SELECT_COLS = 't.id, t.filePath, t.title, t.artist, t.album, t.durationSec, t.missing'

function sanitize(params?: TracksListParams): Required<TracksListParams> {
  const sortBy: TrackSortBy = params?.sortBy && params.sortBy in SORT_COLUMNS ? params.sortBy : 'dateAdded'
  const sortDir = params?.sortDir === 'asc' ? 'asc' : 'desc'
  const limit = Math.min(200, Math.max(1, Math.floor(params?.limit ?? 200)))
  const offset = Math.max(0, Math.floor(params?.offset ?? 0))
  return { search: (params?.search ?? '').trim().slice(0, 200), sortBy, sortDir, limit, offset }
}

/** Quote each token so FTS5 special characters can't break the query. */
function toFtsQuery(search: string): string {
  return search
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' ')
}

/** Paginated track list. Search runs in SQLite FTS5; falls back to LIKE on FTS syntax errors. */
export function listTracks(params?: TracksListParams): TracksListResult {
  const { search, sortBy, sortDir, limit, offset } = sanitize(params)
  const db = getDb()
  const order = `${SORT_COLUMNS[sortBy]} COLLATE NOCASE ${sortDir === 'asc' ? 'ASC' : 'DESC'}, t.id ASC`

  if (!search) {
    const tracks = db
      .prepare(`SELECT ${SELECT_COLS} FROM tracks t ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(limit, offset) as TrackListItem[]
    const { n: total } = db.prepare('SELECT count(*) AS n FROM tracks').get() as { n: number }
    return { tracks, total }
  }

  try {
    const match = toFtsQuery(search)
    const tracks = db
      .prepare(
        `SELECT ${SELECT_COLS} FROM tracks t JOIN tracks_fts ON tracks_fts.rowid = t.id WHERE tracks_fts MATCH ? ORDER BY ${order} LIMIT ? OFFSET ?`
      )
      .all(match, limit, offset) as TrackListItem[]
    const { n: total } = db
      .prepare('SELECT count(*) AS n FROM tracks t JOIN tracks_fts ON tracks_fts.rowid = t.id WHERE tracks_fts MATCH ?')
      .get(match) as { n: number }
    return { tracks, total }
  } catch {
    const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`
    const tracks = db
      .prepare(
        `SELECT ${SELECT_COLS} FROM tracks t WHERE t.title LIKE ? ESCAPE '\\' OR t.artist LIKE ? ESCAPE '\\' OR t.album LIKE ? ESCAPE '\\' ORDER BY ${order} LIMIT ? OFFSET ?`
      )
      .all(like, like, like, limit, offset) as TrackListItem[]
    return { tracks, total: tracks.length }
  }
}
