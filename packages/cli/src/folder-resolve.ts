// Resolve a user-supplied folder path against the folders that actually exist.
//
// Folder names carry a leading "[N] " ORDER prefix (e.g. "[1] Projects"), so a
// path typed without it ("Projects/…") doesn't match and `note move` would
// silently create a duplicate tree. We match exactly first, then again ignoring
// the numeric order prefix on each segment, so "Projects/[2026Q2] X" resolves to
// the real "[1] Projects/[2026Q2] X". Anything unresolved is reported, never
// silently created.

export type FolderResolution =
  | { kind: 'exact'; path: string }
  | { kind: 'normalized'; path: string }   // matched after stripping order prefixes
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'notFound' }

// Strip a leading numeric order prefix like "[0] " / "[12] " from one segment.
// Keeps non-numeric bracket tags like "[2026Q2]".
function stripOrderPrefix(segment: string): string {
  return segment.replace(/^\[\d+\]\s*/, '')
}

function normalizePath(path: string): string {
  return path.split('/').map(stripOrderPrefix).join('/')
}

export function resolveFolder(input: string, existingDirs: string[]): FolderResolution {
  if (existingDirs.includes(input)) return { kind: 'exact', path: input }

  const target = normalizePath(input)
  const matches = existingDirs.filter(d => normalizePath(d) === target)
  if (matches.length === 1) return { kind: 'normalized', path: matches[0] }
  if (matches.length > 1) return { kind: 'ambiguous', candidates: matches }
  return { kind: 'notFound' }
}
