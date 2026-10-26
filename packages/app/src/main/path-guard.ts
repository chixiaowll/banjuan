// Path checks for everything the renderer (or a page shown in it) can ask the
// main process to read, write or open. The renderer shows content from other
// people — synced notes, EPUB/HTML documents — so a path it sends is treated
// as untrusted: it must stay inside an open library or a folder the user picked.
import { shell } from 'electron'
import { statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

export function isInside(root: string, p: string): boolean {
  const r = resolve(root)
  const abs = resolve(p)
  return abs === r || abs.startsWith(r.endsWith(sep) ? r : r + sep)
}

/** Absolute path of a library-relative path; throws if it resolves outside the library. */
export function libraryPath(rootPath: string, rel: string): string {
  const abs = resolve(rootPath, rel)
  if (!isInside(rootPath, abs)) throw new Error(`Path is outside the library: ${rel}`)
  return abs
}

// Folders the user chose in a folder dialog this session. Exports write only
// inside one of these.
const pickedDirs = new Set<string>()

export function rememberPickedDir(dir: string): void {
  pickedDirs.add(resolve(dir))
}

/** The export folder, if it lies inside a folder the user picked; throws otherwise. */
export function exportDir(outputPath: string): string {
  const abs = resolve(outputPath)
  for (const d of pickedDirs) if (isInside(d, abs)) return abs
  throw new Error(`Export folder was not chosen in a folder dialog: ${outputPath}`)
}

// Files and folders the user dropped onto the window (registered by the preload
// from real File objects) — the only outside paths the import handlers accept.
const userChosenPaths = new Set<string>()

export function rememberUserChosenPath(p: string): void {
  if (typeof p === 'string' && p) userChosenPaths.add(resolve(p))
}

/** Throws unless every path is (inside) something the user dropped. */
export function assertUserChosen(paths: string[]): void {
  for (const p of paths) {
    if (![...userChosenPaths].some(c => isInside(c, p))) throw new Error(`Not a file the user chose: ${p}`)
  }
}

// Opening one of these with the default app runs it (an app bundle, a script,
// an installer). Library files can come from anyone, so they're only revealed in
// the file manager instead.
const RUNNABLE_EXT = /\.(app|command|tool|sh|bash|zsh|csh|ksh|fish|py|pl|rb|php|scpt|scptd|applescript|workflow|action|terminal|pkg|mpkg|dmg|jar|exe|bat|cmd|com|msi|msix|ps1|vbs|vbe|js|jse|wsf|wsh|hta|scr|lnk|url|webloc|inetloc|fileloc|desktop|appimage|run|deb|rpm)$/i

/** shell.openPath, except that anything that would run as a program is shown in Finder instead. */
export async function openPathSafely(p: string): Promise<string> {
  let runnable = RUNNABLE_EXT.test(p.replace(/[/\\]+$/, ''))
  try {
    const st = statSync(p)
    if (st.isFile() && (st.mode & 0o111) !== 0) runnable = true   // an executable without a telling extension
  } catch { /* missing: let openPath report it */ }
  if (runnable) {
    console.warn('[open] not running a program from the library, revealing it instead:', p)
    shell.showItemInFolder(p)
    return ''
  }
  return shell.openPath(p)
}
