// File names never synced or served (per-device cache / OS cruft).
export const EXCLUDED_NAMES = new Set([
  'db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm',
  'library.db', 'db.meta.json',
  'sync-snapshot.json', 'sync-archive.json', '.DS_Store',
])

// Directory names never synced or served.
export const EXCLUDED_DIRS = new Set([
  'plugins',
])

// Files that must never be auto-deleted during sync (deletion-tracking only).
export const PROTECTED_FILES = new Set([
  '.banjuan/config.json',
  '.banjuan/tags.json',
  '.banjuan/sync.json',
])

export function isExcluded(name: string, isDirectory: boolean): boolean {
  if (EXCLUDED_NAMES.has(name)) return true
  if (isDirectory && EXCLUDED_DIRS.has(name)) return true
  return false
}
