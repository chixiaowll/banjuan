import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import { extractPdfWith, extractEpub, extractPlain, type Library, type ExtractedPage } from '@banjuan/core'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

/**
 * The iPad's document text index (what the desktop does in a utility process,
 * doc-text-indexer.ts there): documents without text are extracted one at a
 * time, in the web view, while the app is in the foreground, and stored for
 * search. pdf.js streams the PDF from its local URL, so a large book is never
 * read into memory at once; each page yields to the UI.
 */

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('@banjuan/zotero-pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
}

// Same bounds as the desktop.
const MAX_PAGES = 3000
const MAX_PAGE_CHARS = 30_000
const MAX_TOTAL_CHARS = 5_000_000
// EPUB / text files are read whole (unzipped in memory): skip enormous ones.
const MAX_READ_BYTES = 80 * 1024 * 1024
const BATCH = 5
const POLL_MS = 60_000

let running = false
let current: string | null = null
const watched = new WeakSet<Library>()

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

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0))

async function readBytes(path: string): Promise<Uint8Array> {
  const { data } = await Filesystem.readFile({ path, directory: Directory.Documents })
  const binary = atob(data as string)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function extract(lib: Library, relPath: string, type: string): Promise<ExtractedPage[]> {
  const path = `${lib.rootPath}/${relPath}`
  if (type === 'pdf') {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents })
    const r = await extractPdfWith(pdfjsLib, { url: Capacitor.convertFileSrc(uri), cMapUrl: '/bcmaps/' }, { maxPages: MAX_PAGES, onPage: yieldToUi })
    return cap(r.pages)
  }
  const { size } = await Filesystem.stat({ path, directory: Directory.Documents })
  if (size > MAX_READ_BYTES) throw new Error(`too large to index on this device (${Math.round(size / 1048576)} MB)`)
  const data = await readBytes(path)
  return cap(type === 'epub' ? extractEpub(data).pages : extractPlain(data, type).pages)
}

async function indexLibrary(lib: Library, stillOpen: () => boolean): Promise<void> {
  if (!lib.docText.available) return
  lib.docText.prune()
  const tried = new Set<string>()
  let stored = 0
  for (;;) {
    const jobs = lib.docText.pending(BATCH + tried.size).filter(j => !tried.has(j.id)).slice(0, BATCH)
    if (!jobs.length) break
    for (const job of jobs) {
      tried.add(job.id)
      // iOS suspends a backgrounded app; pick up again when it's back.
      if (!stillOpen() || document.visibilityState === 'hidden') return
      current = job.path
      const started = Date.now()
      try {
        const pages = await extract(lib, job.path, job.type)
        if (!stillOpen()) return
        lib.docText.store(job.id, job.hash, pages)
        stored++
        console.log(`[doc-text] ${job.path}: ${pages.length} pages in ${Date.now() - started}ms`)
      } catch (e) {
        if (!stillOpen()) return
        const message = (e as Error)?.message ?? String(e)
        // A file that isn't here yet (not synced down) is tried again later.
        const missing = /not exist|no such file|not found/i.test(message)
        lib.docText.markFailed(job.id, job.hash, missing ? 'missing' : 'failed', message)
        console.warn(`[doc-text] ${job.path}: ${message}`)
      }
      await yieldToUi()
    }
    // Keep what's done: the index lives in memory until written (iOS can kill the app).
    if (stored > 0) { try { await lib.flush() } catch { /* next time */ } stored = 0 }
  }
  if (stored > 0) { try { await lib.flush() } catch { /* next time */ } }
}

/** Start indexing whatever library `getLib` returns (read on every pass). */
export function startDocTextIndexer(getLib: () => Library | null): void {
  const pass = async () => {
    const lib = getLib()
    if (running || !lib) return
    running = true
    try {
      if (!watched.has(lib)) {
        watched.add(lib)
        lib.events.on('document:imported', () => { setTimeout(() => void pass(), 2000) })
      }
      await indexLibrary(lib, () => getLib() === lib)
    } catch (e) {
      console.warn('[doc-text] pass failed', e)
    } finally {
      running = false
      current = null
    }
  }
  setTimeout(() => void pass(), 5000)
  setInterval(() => void pass(), POLL_MS)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => void pass(), 3000) })
}

export function docTextStatus(lib: Library): { total: number; indexed: number; pending: number; failed: number; running: boolean } {
  return { ...lib.docText.stats(), running: running && current !== null }
}
