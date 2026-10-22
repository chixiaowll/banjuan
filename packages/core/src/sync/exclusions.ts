// Per-device files — identity, LAN pairings, WebDAV endpoint + credentials —
// never synced and never served to (or writable by) a LAN peer.
export const DEVICE_LOCAL_PATHS: ReadonlySet<string> = new Set([
  '.banjuan/config.json',
  '.banjuan/paired-devices.json',
  '.banjuan/sync.json',
])

// Suffix of in-flight temp files from atomic writes (platform-node TEMP_SUFFIX);
// one can be left behind only if the process died mid-write.
const TEMP_SUFFIX = '.banjuan-tmp'

// File names never synced or served (per-device cache / OS cruft).
export const EXCLUDED_NAMES = new Set([
  'db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm',
  'library.db', 'db.meta.json',
  'sync-snapshot.json', 'sync-archive.json', '.DS_Store',
])

// Directory names never synced or served.
export const EXCLUDED_DIRS = new Set([
  'plugins',
  '.sync-trash',   // .banjuan/.sync-trash: local recovery copies of synced-away deletions
  '.trash',        // .banjuan/.trash: this device's recycle bin
])

// Files that must never be auto-deleted during sync (deletion-tracking only).
export const PROTECTED_FILES = new Set([
  '.banjuan/config.json',
  '.banjuan/tags.json',
  '.banjuan/sync.json',
])

export function isExcluded(name: string, isDirectory: boolean): boolean {
  if (EXCLUDED_NAMES.has(name)) return true
  if (!isDirectory && name.endsWith(TEMP_SUFFIX)) return true
  if (isDirectory && EXCLUDED_DIRS.has(name)) return true
  return false
}
