import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * %APPDATA%/Nocturne — created safely on first use.
 * NOCTURNE_DATA_DIR override exists for isolated dev/test runs (portable-mode seed).
 */
export function getNocturneDir(): string {
  const override = process.env['NOCTURNE_DATA_DIR']
  if (override) return ensureDir(resolve(override))
  return ensureDir(join(app.getPath('appData'), 'Nocturne'))
}

export function getDbPath(): string {
  return join(getNocturneDir(), 'nocturne.db')
}

export function getCoversDir(): string {
  return ensureDir(join(getNocturneDir(), 'covers'))
}

export function getLogsDir(): string {
  return ensureDir(join(getNocturneDir(), 'logs'))
}
