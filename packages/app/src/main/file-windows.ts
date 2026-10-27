import { realpathSync, statSync } from 'node:fs'
import { extname, dirname, resolve, sep } from 'node:path'
import type { SingleFileInfo } from '@banjuan/shared-ui'

/**
 * Files opened on their own, outside any library (single-file windows, like
 * opening a file in VS Code without a folder): from the Finder, the command
 * line, or File › Open File…. One window per file; each window may read only
 * its own file (see the file:* IPC handlers).
 */

export type SingleFileType = SingleFileInfo['type']

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
// What a web page saved to disk loads from beside it — not scripts, not other pages.
const PAGE_RESOURCE_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.svg', '.avif', '.bmp', '.ico', '.css', '.woff', '.woff2', '.ttf', '.otf'])

export function fileTypeOf(path: string): SingleFileType {
  const ext = extname(path).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.epub') return 'epub'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.txt') return 'text'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === '.html' || ext === '.htm') return 'html'
  return 'unsupported'
}

const isFile = (p: string) => { try { return statSync(p).isFile() } catch { return false } }

/**
 * Files named on the command line that started the app. Skips the program
 * itself (and, unpackaged, the script it runs), flags, and anything that isn't
 * an existing file.
 */
export function filesFromArgv(argv: string[], isPackaged: boolean): string[] {
  return argv.slice(isPackaged ? 1 : 2).filter(a => !a.startsWith('-') && isFile(a)).map(a => resolve(a))
}

const real = (p: string) => { try { return realpathSync(p) } catch { return null } }
const inside = (root: string, p: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep)

/** The known library `realPath` lies in, if any. */
export function libraryContaining(realPath: string, history: Array<{ path: string; name: string }>): { root: string; name: string } | undefined {
  for (const entry of history) {
    const root = real(entry.path)
    if (root && inside(root, realPath) && root !== realPath) return { root, name: entry.name }
  }
  return undefined
}

export interface OpenedFile {
  /** Real path. */
  path: string
  type: SingleFileType
  windowId: number
}

/** What the registry needs from the window system (injected, so it can be tested without Electron). */
export interface FileWindowHooks<W> {
  create(path: string): { win: W; id: number }
  focus(win: W): void
  onClosed(win: W, cb: () => void): void
}

export class FileWindowRegistry<W> {
  private byPath = new Map<string, { win: W; file: OpenedFile }>()
  private byWindow = new Map<number, OpenedFile>()

  constructor(private hooks: FileWindowHooks<W>) {}

  /** Open `path` in its own window, or bring forward the window that has it. Throws for anything but an existing file. */
  open(path: string): OpenedFile {
    const realPath = real(resolve(path))
    if (!realPath || !isFile(realPath)) throw new Error(`Not a file: ${path}`)
    const existing = this.byPath.get(realPath)
    if (existing) {
      this.hooks.focus(existing.win)
      return existing.file
    }
    const { win, id } = this.hooks.create(realPath)
    const file: OpenedFile = { path: realPath, type: fileTypeOf(realPath), windowId: id }
    this.byPath.set(realPath, { win, file })
    this.byWindow.set(id, file)
    this.hooks.onClosed(win, () => {
      this.byPath.delete(realPath)
      this.byWindow.delete(id)
    })
    return file
  }

  fileOf(windowId: number): OpenedFile | undefined {
    return this.byWindow.get(windowId)
  }

  all(): OpenedFile[] {
    return [...this.byWindow.values()]
  }

  /**
   * May the local-file protocol serve `path`? An opened file itself, the
   * images in the folder of an opened Markdown / text file (relative image
   * links in its preview), and the stylesheets, images and fonts in the folder
   * of an opened HTML page — nothing else.
   */
  isServable(path: string): boolean {
    const p = real(path)
    if (!p) return false
    if (this.byPath.has(p)) return true
    const ext = extname(p).toLowerCase()
    for (const file of this.byWindow.values()) {
      if (!inside(dirname(file.path), p)) continue
      if ((file.type === 'markdown' || file.type === 'text') && IMAGE_EXTENSIONS.has(ext)) return true
      if (file.type === 'html' && PAGE_RESOURCE_EXTENSIONS.has(ext)) return true
    }
    return false
  }
}
