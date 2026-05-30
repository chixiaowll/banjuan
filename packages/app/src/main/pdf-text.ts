import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { app } from 'electron'
import { unzipSync, strFromU8 } from 'fflate'

// Bound the text returned per call so a huge book/chapter can't blow up tokens.
const MAX_TOTAL_CHARS = 80_000

// pdfjs is loaded at runtime via a computed path, NOT bundled by vite. The
// legacy build self-polyfills DOM globals for Node, but only when loaded as its
// original file — vite-bundling it breaks that. Dev resolves from node_modules;
// packaged loads the copy in resources (see electron-builder.yml extraResources).
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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
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

async function extractPdf(absPath: string, fromPage: number, toPage?: number): Promise<DocumentTextResult> {
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

/** EPUB: extract text per spine item (chapter). "page" == 1-based chapter index. */
function extractEpub(absPath: string, fromPage: number, toPage?: number): DocumentTextResult {
  const files = unzipSync(new Uint8Array(readFileSync(absPath)))
  const container = files['META-INF/container.xml']
  const opfPath = container ? strFromU8(container).match(/full-path="([^"]+)"/)?.[1] : undefined
  if (!opfPath || !files[opfPath]) throw new Error('Invalid EPUB: missing OPF')
  const opf = strFromU8(files[opfPath])
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const manifest: Record<string, string> = {}
  for (const m of opf.matchAll(/<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*>/g)) manifest[m[1]] = m[2]
  for (const m of opf.matchAll(/<item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"[^>]*>/g)) if (!manifest[m[2]]) manifest[m[2]] = m[1]
  const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map(m => m[1])
  const hrefs = spine.map(id => manifest[id]).filter(Boolean)
  if (hrefs.length === 0) throw new Error('Invalid EPUB: empty spine')

  const numPages = hrefs.length
  const start = Math.max(1, Math.min(fromPage || 1, numPages))
  // Chapters can be large — default to a small span unless explicitly asked.
  const end = Math.max(start, Math.min(toPage ?? start, numPages, start + 4))
  const pages: Array<{ page: number; text: string }> = []
  for (let i = start; i <= end; i++) {
    const href = decodeURIComponent(hrefs[i - 1])
    const data = files[opfDir + href] || files[href]
    pages.push({ page: i, text: data ? stripHtml(strFromU8(data)) : '' })
  }
  return { numPages, from: start, to: end, pages }
}

function extractPlain(absPath: string, type: string): DocumentTextResult {
  const raw = readFileSync(absPath, 'utf-8')
  const text = type === 'html' ? stripHtml(raw) : raw.replace(/\r\n/g, '\n').trim()
  return { numPages: 1, from: 1, to: 1, pages: [{ page: 1, text }] }
}

/** Extract readable text from a document by type. Returns pages for the requested range. */
export async function extractDocumentText(
  absPath: string,
  type: string,
  fromPage = 1,
  toPage?: number,
): Promise<DocumentTextResult & { truncated?: boolean }> {
  let result: DocumentTextResult
  switch (type) {
    case 'pdf': result = await extractPdf(absPath, fromPage, toPage); break
    case 'epub': result = extractEpub(absPath, fromPage, toPage); break
    case 'txt': case 'md': case 'html': result = extractPlain(absPath, type); break
    default: throw new Error(`Text extraction is not supported for type "${type}"`)
  }
  const capped = capPages(result)
  // A pdf/epub range that hit the page cap is also "truncated" w.r.t. the doc.
  if (capped.to < capped.numPages) capped.truncated = true
  return capped
}
