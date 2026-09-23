import Database from 'better-sqlite3'
import { getDbPath } from '../lib/paths'

let db: Database.Database | null = null

const DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  appliedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folderPath TEXT NOT NULL UNIQUE COLLATE NOCASE,
  dateAdded INTEGER NOT NULL,
  lastScannedAt INTEGER NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1))
);

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filePath TEXT NOT NULL UNIQUE COLLATE NOCASE,
  folderId INTEGER NULL REFERENCES folders(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title TEXT NOT NULL DEFAULT 'Unknown Title',
  artist TEXT NOT NULL DEFAULT 'Unknown Artist' COLLATE NOCASE,
  album TEXT NOT NULL DEFAULT 'Unknown Album' COLLATE NOCASE,
  albumArtist TEXT NULL,
  genre TEXT NULL,
  year INTEGER NULL CHECK (year IS NULL OR (year >= 0 AND year <= 9999)),
  trackNo INTEGER NULL,
  discNo INTEGER NULL,
  durationSec REAL NULL CHECK (durationSec IS NULL OR durationSec >= 0),
  bitrate INTEGER NULL,
  sampleRate INTEGER NULL,
  channels INTEGER NULL,
  fileSizeBytes INTEGER NULL,
  mtimeMs INTEGER NULL,
  coverCacheKey TEXT NULL,
  hasCover INTEGER NOT NULL DEFAULT 0 CHECK (hasCover IN (0,1)),
  lrcPath TEXT NULL,
  hasEmbeddedLyrics INTEGER NOT NULL DEFAULT 0 CHECK (hasEmbeddedLyrics IN (0,1)),
  lyricSource TEXT NOT NULL DEFAULT 'none'
    CHECK (lyricSource IN ('sidecar-lrc','embedded-synced','embedded-unsynced','none')),
  missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0,1)),
  lastError TEXT NULL,
  dateAdded INTEGER NOT NULL,
  lastSeenAt INTEGER NOT NULL,
  lastPlayedAt INTEGER NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS play_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  trackId INTEGER NULL REFERENCES tracks(id) ON DELETE SET NULL,
  positionSec REAL NOT NULL DEFAULT 0 CHECK (positionSec >= 0),
  volume INTEGER NOT NULL DEFAULT 80 CHECK (volume >= 0 AND volume <= 100),
  updatedAt INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version(version, appliedAt)
VALUES (1, CAST(strftime('%s','now') AS INTEGER)*1000);

INSERT OR IGNORE INTO play_state(id, positionSec, volume, updatedAt)
VALUES (1, 0, 80, CAST(strftime('%s','now') AS INTEGER)*1000);

INSERT OR IGNORE INTO settings(key, value, updatedAt) VALUES
  ('volume', '80', CAST(strftime('%s','now') AS INTEGER)*1000),
  ('muted', '0', CAST(strftime('%s','now') AS INTEGER)*1000),
  ('repeat', 'off', CAST(strftime('%s','now') AS INTEGER)*1000),
  ('shuffle', '0', CAST(strftime('%s','now') AS INTEGER)*1000),
  ('lyricOffsetMs', '0', CAST(strftime('%s','now') AS INTEGER)*1000);

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  title, artist, album,
  content='tracks', content_rowid='id',
  tokenize='unicode61 remove_diacritics 1'
);

CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;
CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
END;
CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE INDEX IF NOT EXISTS idx_tracks_folder_missing
  ON tracks(folderId, missing);
CREATE INDEX IF NOT EXISTS idx_tracks_missing_seen
  ON tracks(missing, lastSeenAt);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_dateAdded ON tracks(dateAdded DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_lastPlayed ON tracks(lastPlayedAt DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_duration ON tracks(durationSec);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(folderPath);
`

/** Open (creating if needed) %APPDATA%/Nocturne/nocturne.db and run migrations. */
export function initDb(): Database.Database {
  if (db) return db
  const instance = new Database(getDbPath())
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  instance.pragma('synchronous = NORMAL')
  instance.pragma('temp_store = MEMORY')
  instance.pragma('busy_timeout = 5000')
  instance.exec(DDL)
  db = instance
  return instance
}

export function getDb(): Database.Database {
  if (!db) return initDb()
  return db
}

/** Tiny boot self-test: proves the schema + seed row exist. */
export function selfTestDb(): { schemaVersionRows: number } {
  const row = getDb().prepare('SELECT count(*) AS n FROM schema_version').get() as { n: number }
  return { schemaVersionRows: row.n }
}
