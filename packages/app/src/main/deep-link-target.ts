import type { ParsedLink } from '@banjuan/core'

/**
 * Which library a banjuan:// link opens in. A library the link names counts
 * only when the user has opened it before (recent libraries, by real path): a
 * link from a web page must not get Banjuan to open some other folder. Else the
 * open library that has the item. Null when none.
 */
export async function pickLibrary<L extends { rootPath: string }>(
  link: ParsedLink,
  opts: { history: string[]; open: L[]; real: (p: string) => string; has: (lib: L, link: ParsedLink) => Promise<boolean> },
): Promise<{ path: string; lib: L | undefined } | null> {
  const named = link.query.library
  if (named) {
    const target = opts.real(named)
    const known = opts.history.find(h => opts.real(h) === target)
    if (known) return { path: known, lib: opts.open.find(l => opts.real(l.rootPath) === target) }
  }
  for (const lib of opts.open) {
    if (await opts.has(lib, link)) return { path: lib.rootPath, lib }
  }
  return null
}
