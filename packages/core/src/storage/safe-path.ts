// Ids and relative paths that end up in file paths often come from files a
// sync peer wrote (note/document/annotation JSON). These checks keep such a
// value from pointing outside the folder it's joined onto.

/** An id usable as a single path segment: uuid-like, no separators or dot-dot. */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(id) && !id.includes('..')
}

/** A plain relative path ("a/b.pdf"): not absolute, no backslashes, NUL, drive letters, or ''/'.'/'..' segments. */
export function isPlainRelPath(rel: unknown): rel is string {
  if (typeof rel !== 'string' || !rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) return false
  const segments = rel.split('/')
  if (/^[a-zA-Z]:/.test(segments[0])) return false
  return !segments.some(seg => seg === '' || seg === '.' || seg === '..')
}

/** JsonStore check for document records: the path is joined onto the library root. */
export const hasPlainPath = (d: { path?: unknown }): boolean => isPlainRelPath(d.path)
