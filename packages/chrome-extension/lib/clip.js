import { extractPage } from './extract.js'
import { findApp, postClip } from './connection.js'

/** An error whose `code` is a message name in _locales (shown translated). */
export class ClipError extends Error {
  constructor(code, detail) {
    super(detail || code)
    this.code = code
  }
}

/** Read the tab's article (or selection) as a standalone page. */
export async function readTab(tabId, mode) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/Readability.js'] })
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPage, args: [mode] })
    if (!res?.result) throw new Error('no result')
    return res.result
  } catch (e) {
    // chrome:// pages, the Web Store, PDFs in the built-in viewer…
    throw new ClipError('errCannotClip', e?.message)
  }
}

export async function clipTab(tabId, mode, tags = []) {
  const app = await findApp()
  if (!app) throw new ClipError('errNotRunning')
  if (!app.libraryOpen) throw new ClipError('errNoLibrary')
  const data = await readTab(tabId, mode)
  return postClip(app.port, { ...data, tags })
}

/** A user-facing message for an error from clipTab. */
export function errorText(e) {
  const t = (k, s) => chrome.i18n.getMessage(k, s)
  if (e instanceof ClipError && e.code) return t(e.code)
  return t('failed', [e?.message || String(e)])
}
