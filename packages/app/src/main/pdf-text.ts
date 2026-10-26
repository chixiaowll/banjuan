import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { extractPdf, extractEpub, extractPlain, type PdfjsLocation, type ExtractedPage } from '@banjuan/core'

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

/** Extract readable text from a document by type. Returns pages for the requested range. */
export async function extractDocumentText(
  absPath: string,
  type: string,
  fromPage = 1,
  toPage?: number,
): Promise<DocumentTextResult & { truncated?: boolean }> {
  const data = new Uint8Array(readFileSync(absPath))
  let result: DocumentTextResult
  switch (type) {
    case 'pdf': {
      const r = await extractPdf(data, pdfjsLocation(), { fromPage, toPage: toPage ?? fromPage })
      result = { numPages: r.numPages, from: r.pages[0]?.page ?? 1, to: r.pages.at(-1)?.page ?? 1, pages: r.pages }
      break
    }
    case 'epub': {
      // Chapters can be large — default to a small span unless explicitly asked.
      const start = Math.max(1, fromPage || 1)
      const r = extractEpub(data, { fromPage: start, toPage: Math.min(toPage ?? start, start + 4) })
      result = { numPages: r.numPages, from: r.pages[0]?.page ?? 1, to: r.pages.at(-1)?.page ?? 1, pages: r.pages }
      break
    }
    case 'txt': case 'md': case 'html': {
      const r = extractPlain(data, type)
      result = { numPages: 1, from: 1, to: 1, pages: r.pages }
      break
    }
    default: throw new Error(`Text extraction is not supported for type "${type}"`)
  }
  const capped = capPages(result)
  // A pdf/epub range that hit the page cap is also "truncated" w.r.t. the doc.
  if (capped.to < capped.numPages) capped.truncated = true
  return capped
}
