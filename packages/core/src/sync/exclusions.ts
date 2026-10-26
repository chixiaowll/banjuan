import { isPlainRelPath } from '../storage/safe-path.js'

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
  'sync-archives', // .banjuan/sync-archives: this device's per-server sync baselines
  '.sync-trash',   // .banjuan/.sync-trash: local recovery copies of synced-away deletions
  '.trash',        // .banjuan/.trash: this device's recycle bin
  '.cover-cache',  // .banjuan/.cover-cache: document thumbnails, made per device
])

// Files that must never be auto-deleted during sync (deletion-tracking only).
export const PROTECTED_FILES = new Set([
  '.banjuan/config.json',
  '.banjuan/tags.json',
  '.banjuan/sync.json',
])

// Compared case-insensitively: on macOS/Windows "PLUGINS" and "plugins" are the
// same folder, so a peer must not get around an exclusion by changing case.
const EXCLUDED_NAMES_LC = new Set([...EXCLUDED_NAMES].map(n => n.toLowerCase()))
const EXCLUDED_DIRS_LC = new Set([...EXCLUDED_DIRS].map(n => n.toLowerCase()))
const DEVICE_LOCAL_LC = new Set([...DEVICE_LOCAL_PATHS].map(n => n.toLowerCase()))

export function isExcluded(name: string, isDirectory: boolean): boolean {
  const lc = name.toLowerCase()
  if (EXCLUDED_NAMES_LC.has(lc)) return true
  if (!isDirectory && /^(db\.sqlite|library\.db)\.corrupt-/.test(lc)) return true   // a damaged index set aside (platform-capacitor)
  if (!isDirectory && lc.endsWith(TEMP_SUFFIX)) return true
  if (isDirectory && EXCLUDED_DIRS_LC.has(lc)) return true
  return false
}

/** A per-device file (identity, pairings, sync credentials), whatever its case. */
export function isDeviceLocalPath(rel: string): boolean {
  return DEVICE_LOCAL_LC.has(rel.toLowerCase())
}

/**
 * Whether a library-relative file path that came from elsewhere (a WebDAV
 * listing, a LAN peer) may be written into the library: a plain relative path
 * that stays inside it and touches nothing excluded or per-device.
 */
export function isSyncablePath(rel: string): boolean {
  if (!isPlainRelPath(rel) || isDeviceLocalPath(rel)) return false
  const segments = rel.split('/')
  return !segments.some((seg, i) => isExcluded(seg, i < segments.length - 1))
}
