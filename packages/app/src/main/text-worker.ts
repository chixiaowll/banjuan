import { readFileSync, statSync } from 'node:fs'
import { extractPdf, extractEpub, extractPlain, type PdfjsLocation, type ExtractedPage } from '@banjuan/core/dist/search/doc-text-extract.js'   // just the extractor: this process needs nothing else

/**
 * Background text extraction for the search index, in an Electron utility
 * process (doc-text-indexer.ts starts it): parsing a large PDF takes seconds of
 * CPU, which would stall the main process and every IPC call behind it, and a
 * malformed file can't take the app down from here.
 *
 * Messages in: { type: 'init', loc } then { type: 'extract', id, path, docType }
 * (the whole document, for the index) or { type: 'range', id, path, docType,
 * fromPage, toPage } (some pages, for the local API).
 * Messages out: { id, pages, numPages? } or { id, error, missing }.
 */

// A book can be long; an index entry beyond this helps nobody and costs memory.
const MAX_PAGES = 3000
const MAX_PAGE_CHARS = 30_000
const MAX_TOTAL_CHARS = 5_000_000
// Files are parsed from memory: one this large would take the process down
// (and isn't readable by pdf.js here anyway).
const MAX_FILE_BYTES = 1024 * 1024 * 1024

function readWhole(path: string): Uint8Array {
  const { size } = statSync(path)
  if (size > MAX_FILE_BYTES) throw new Error(`too large to index (${Math.round(size / 1048576)} MB)`)
  return new Uint8Array(readFileSync(path))
}

// pdf.js decides at load time whether it runs in Node: not in an Electron process
// whose type isn't "browser" (here: "utility"), and then it wants a Web Worker
// and fetch()es its CMaps, neither of which works here. This process only
// extracts text, so let it see the Node environment it really is.
try { Object.defineProperty(process, 'type', { value: 'browser', configurable: true }) } catch { /* read-only */ }

let loc: PdfjsLocation | null = null
const port = (process as any).parentPort as { on(e: 'message', cb: (e: { data: any }) => void): void; postMessage(msg: unknown): void }

function cap(pages: ExtractedPage[]): ExtractedPage[] {
  let budget = MAX_TOTAL_CHARS
  const out: ExtractedPage[] = []
  for (const p of pages) {
    if (budget <= 0) break
    const text = p.text.slice(0, Math.min(MAX_PAGE_CHARS, budget))
    budget -= text.length
    out.push({ page: p.page, text })
  }
  return out
}

async function extract(path: string, docType: string): Promise<ExtractedPage[]> {
  const data = readWhole(path)
  switch (docType) {
    case 'pdf': return cap((await extractPdf(data, loc!, { maxPages: MAX_PAGES })).pages)
    case 'epub': return cap(extractEpub(data).pages)
    default: return cap(extractPlain(data, docType).pages)
  }
}

/** Pages `fromPage`–`toPage` (EPUB: chapters, at most 5) and the document's page count. */
async function extractRange(path: string, docType: string, fromPage: number, toPage: number): Promise<{ numPages: number; pages: ExtractedPage[] }> {
  const data = readWhole(path)
  switch (docType) {
    case 'pdf': {
      const r = await extractPdf(data, loc!, { fromPage, toPage })
      return { numPages: r.numPages, pages: r.pages }
    }
    case 'epub': {
      // Chapters can be large — default to a small span unless explicitly asked.
      const start = Math.max(1, fromPage || 1)
      return extractEpub(data, { fromPage: start, toPage: Math.min(toPage, start + 4) })
    }
    default: return { numPages: 1, pages: extractPlain(data, docType).pages }
  }
}

port.on('message', async ({ data: msg }) => {
  if (msg?.type === 'init') { loc = msg.loc; return }
  try {
    if (msg?.type === 'extract') port.postMessage({ id: msg.id, pages: await extract(msg.path, msg.docType) })
    else if (msg?.type === 'range') port.postMessage({ id: msg.id, ...(await extractRange(msg.path, msg.docType, msg.fromPage, msg.toPage)) })
  } catch (e: any) {
    port.postMessage({ id: msg.id, error: String(e?.message ?? e), missing: e?.code === 'ENOENT' })
  }
})
