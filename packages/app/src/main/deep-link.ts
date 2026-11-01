import { BrowserWindow, ipcMain, webContents } from 'electron'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseLink, type ParsedLink, type Library } from '@banjuan/core'
import { pickLibrary } from './deep-link-target.js'
import { libraries, getLibraryHistory } from './ipc.js'
import { createWindow, getLastFocusedLibraryWindow, setBanjuanLinkHandler } from './windows.js'

/**
 * banjuan:// links (AI answers citing a page, note links written out as
 * Markdown): open the document page, annotation or note in a library window.
 * Only ever opens things to look at — a link changes nothing.
 */

const real = (p: string) => { try { return realpathSync(p) } catch { return resolve(p) } }

async function has(lib: Library, link: ParsedLink): Promise<boolean> {
  try {
    if (link.kind === 'doc') return !!(await lib.documents.get(link.id))
    if (link.kind === 'note') return !!(await lib.notes.get(link.id))
    if (link.kind === 'task') return !!lib.tasks.get(link.id)
    return !!(await lib.annotations.get(link.id))
  } catch {
    return false
  }
}

export async function openDeepLink(url: string): Promise<void> {
  const link = parseLink(url)
  if (!link) { console.warn('[deep-link] not a banjuan link:', url.slice(0, 200)); return }
  const open = [...new Set(libraries.values())]
  const target = await pickLibrary(link, { history: getLibraryHistory().map(e => e.path), open, real, has })
  console.log(`[deep-link] ${link.kind} ${link.id} →`, target?.path ?? 'not found')
  if (!target) {
    // A library window says so (a toast) after looking in its own library.
    // Not a sheet: while one is up macOS turns a quit away before the app
    // hears of it, and the window may be on another Space or behind others.
    const win = getLastFocusedLibraryWindow()
    if (!win) {
      const recent = getLibraryHistory()[0]?.path
      createWindow(recent ? { hash: new URLSearchParams({ library: recent, openLink: url }).toString() } : {})
      return
    }
    if (win.isMinimized()) win.restore()
    win.show(); win.focus()
    win.webContents.send('library:open-link', url)
    return
  }
  // A window showing that library: hand it the link. Else open one for it.
  for (const [key, lib] of libraries) {
    if (key < 0 || real(lib.rootPath) !== real(target.path)) continue
    const wc = webContents.fromId(key)
    if (!wc || wc.isDestroyed()) continue
    const win = BrowserWindow.fromWebContents(wc)
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
    wc.send('library:open-link', url)
    return
  }
  createWindow({ hash: new URLSearchParams({ library: target.path, openLink: url }).toString() })
}

/** Links clicked inside the app (notes, the assistant's answers) go the same way. */
export function registerDeepLinkHandlers(): void {
  setBanjuanLinkHandler(url => { void openDeepLink(url) })
  ipcMain.on('link:open', (_e, url: unknown) => { if (typeof url === 'string') void openDeepLink(url) })
}
