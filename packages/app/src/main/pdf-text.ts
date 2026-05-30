import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { app } from 'electron'

// IMPORTANT: pdfjs is loaded at runtime via a computed path, NOT bundled by
// vite. The legacy build self-polyfills DOM globals (DOMMatrix, etc.) for Node,
// but only when loaded as its original file — vite-bundling it breaks that. In
// dev we resolve it from node_modules; when packaged it's copied to resources
// (see electron-builder.yml extraResources).
const require = createRequire(import.meta.url)
let pdfjsPromise: Promise<any> | null = null
function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    const entry = app.isPackaged
      ? pathToFileURL(join(process.resourcesPath, 'pdfjs', 'pdf.mjs')).href
      : pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
    pdfjsPromise = import(/* @vite-ignore */ entry)
  }
  return pdfjsPromise
}

export interface DocumentTextResult {
  numPages: number
  from: number
  to: number
  pages: Array<{ page: number; text: string }>
}

/** Extract text from a PDF on disk, for pages [fromPage, toPage] (1-based, inclusive). */
export async function extractPdfText(absPath: string, fromPage = 1, toPage?: number): Promise<DocumentTextResult> {
  const pdfjs = await getPdfjs()
  const data = new Uint8Array(readFileSync(absPath))
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise
  try {
    const numPages = doc.numPages
    const start = Math.max(1, Math.min(fromPage || 1, numPages))
    const end = Math.max(start, Math.min(toPage ?? start, numPages))
    const pages: Array<{ page: number; text: string }> = []
    for (let p = start; p <= end; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      const text = tc.items.map((i: any) => (typeof i.str === 'string' ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim()
      pages.push({ page: p, text })
      try { page.cleanup() } catch { /* ignore */ }
    }
    return { numPages, from: start, to: end, pages }
  } finally {
    try { await doc.destroy() } catch { /* ignore */ }
  }
}
