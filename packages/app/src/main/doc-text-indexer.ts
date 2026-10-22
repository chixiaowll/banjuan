import { utilityProcess, type UtilityProcess } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Library, DocTextJob } from '@banjuan/core'
import { pdfjsLocation } from './pdf-text.js'

/**
 * Fills the document text index (core DocTextService) in the background:
 * whenever a library has documents without text — just opened, a file
 * imported, changed or synced — they are extracted one at a time in a utility
 * process (text-worker.ts) and stored. A document that times out or can't be
 * read is marked failed and not retried until its file changes.
 */

const JOB_TIMEOUT_MS = 120_000
const POLL_MS = 30_000
const BATCH = 10

type Reply = { id: number; pages?: Array<{ page: number; text: string }>; error?: string; missing?: boolean }

class TextWorker {
  private child: UtilityProcess | null = null
  private nextId = 1
  private waiting = new Map<number, (r: Reply) => void>()

  private ensure(): UtilityProcess {
    if (this.child) return this.child
    const here = dirname(fileURLToPath(import.meta.url))
    const child = utilityProcess.fork(join(here, '..', 'worker', 'text-worker.js'), [], { serviceName: 'Banjuan text index' })
    child.postMessage({ type: 'init', loc: pdfjsLocation() })
    child.on('message', (r: Reply) => { this.waiting.get(r.id)?.(r); this.waiting.delete(r.id) })
    child.on('exit', (code) => {
      if (this.child === child) this.child = null
      for (const [id, done] of this.waiting) done({ id, error: `text worker exited (${code})` })
      this.waiting.clear()
    })
    this.child = child
    return child
  }

  extract(path: string, docType: string): Promise<Reply> {
    const child = this.ensure()
    const id = this.nextId++
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        resolve({ id, error: 'timed out' })
        child.kill()   // a fresh process for the next document
      }, JOB_TIMEOUT_MS)
      this.waiting.set(id, r => { clearTimeout(timer); resolve(r) })
      child.postMessage({ type: 'extract', id, path, docType })
    })
  }

  stop(): void {
    this.child?.kill()
    this.child = null
  }
}

let worker: TextWorker | null = null
let running = false
let rerun = false
let current: { library: string; title: string } | null = null
const watched = new WeakSet<Library>()

export function docTextStatus(lib: Library): { indexed: number; pending: number; failed: number; total: number; running: boolean } {
  return { ...lib.docText.stats(), running: running && current?.library === lib.rootPath }
}

/**
 * Start indexing. `libraries` returns the open libraries (it is read on every
 * pass, so libraries opened later are picked up).
 */
export function startDocTextIndexer(libraries: () => Iterable<Library>): void {
  worker ??= new TextWorker()
  const pass = async () => {
    if (running) { rerun = true; return }
    running = true
    try {
      do {
        rerun = false
        for (const lib of new Set(libraries())) {
          if (!watched.has(lib)) {
            watched.add(lib)
            lib.events.on('document:imported', () => void pass())
          }
          await indexLibrary(lib, () => [...libraries()].includes(lib))
        }
      } while (rerun)
    } catch (e) {
      console.warn('[doc-text] pass failed', e)
    } finally {
      running = false
      current = null
    }
  }
  setTimeout(() => void pass(), 3000)
  setInterval(() => void pass(), POLL_MS)
}

export function stopDocTextIndexer(): void {
  worker?.stop()
}

async function indexLibrary(lib: Library, stillOpen: () => boolean): Promise<void> {
  if (!lib.docText.available) return
  lib.docText.prune()
  // Each document once per pass: "missing" ones (file not here yet) stay pending.
  const tried = new Set<string>()
  for (;;) {
    const jobs: DocTextJob[] = lib.docText.pending(BATCH + tried.size).filter(j => !tried.has(j.id)).slice(0, BATCH)
    if (!jobs.length) return
    for (const job of jobs) {
      tried.add(job.id)
      if (!stillOpen()) return
      current = { library: lib.rootPath, title: job.path }
      const started = Date.now()
      const r = await worker!.extract(join(lib.rootPath, job.path), job.type)
      if (!stillOpen()) return   // closed meanwhile: its database is gone
      if (r.pages) {
        lib.docText.store(job.id, job.hash, r.pages)
        console.log(`[doc-text] ${job.path}: ${r.pages.length} pages in ${Date.now() - started}ms`)
      } else {
        lib.docText.markFailed(job.id, job.hash, r.missing ? 'missing' : 'failed', r.error ?? 'unknown error')
        console.warn(`[doc-text] ${job.path}: ${r.error}`)
      }
    }
  }
}
