import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import type { PdfjsLocation, ExtractedPage } from '@banjuan/core'
import { extractTextRange } from './doc-text-indexer.js'

// Bound the text returned per call so a huge book/chapter can't blow up tokens.
const MAX_TOTAL_CHARS = 80_000

/**
 * Where pdf.js is. It is loaded at runtime from its own files, NOT bundled by
 * vite: the legacy build self-polyfills DOM globals for Node only when loaded as
 * its original file, and imports pdf.worker.mjs next to itself. Dev resolves it
 * from node_modules; packaged copies live in resources (electron-builder.yml).
 */
export function pdfjsLocation(): PdfjsLocation {
  if (app.isPackaged) {
    const dir = join(process.resourcesPath, 'pdfjs')
    return { pdfUrl: pathToFileURL(join(dir, 'pdf.mjs')).href, cMapDir: join(dir, 'cmaps') + '/' }
  }
  const require = createRequire(import.meta.url)
  const pdfMjs = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  return { pdfUrl: pathToFileURL(pdfMjs).href, cMapDir: join(dirname(pdfMjs), '..', '..', 'cmaps') + '/' }
}

export interface DocumentTextResult {
  numPages: number
  from: number
  to: number
  pages: ExtractedPage[]
}

/** Cap total characters across pages so one call stays token-bounded. */
function capPages(result: DocumentTextResult): DocumentTextResult & { truncated?: boolean } {
  let budget = MAX_TOTAL_CHARS
  let truncated = false
  const pages = []
  for (const p of result.pages) {
    if (budget <= 0) { truncated = true; break }
    const text = p.text.length > budget ? p.text.slice(0, budget) + ' …(truncated)' : p.text
    if (p.text.length > budget) truncated = true
    budget -= text.length
    pages.push({ page: p.page, text })
  }
  return { ...result, pages, truncated }
}

/**
 * Readable text of a document's pages `fromPage`–`toPage`, bounded for one
 * API answer. Parsing runs in a utility process (a large PDF took the main
 * process — and every window's IPC — for seconds).
 */
export async function extractDocumentText(
  absPath: string,
  type: string,
  fromPage = 1,
  toPage?: number,
): Promise<DocumentTextResult & { truncated?: boolean }> {
  if (!['pdf', 'epub', 'txt', 'md', 'html'].includes(type)) throw new Error(`Text extraction is not supported for type "${type}"`)
  const r = await extractTextRange(absPath, type, fromPage, toPage ?? fromPage)
  const result: DocumentTextResult = { numPages: r.numPages, from: r.pages[0]?.page ?? 1, to: r.pages.at(-1)?.page ?? 1, pages: r.pages }
  const capped = capPages(result)
  // A pdf/epub range that hit the page cap is also "truncated" w.r.t. the doc.
  if (capped.to < capped.numPages) capped.truncated = true
  return capped
}
