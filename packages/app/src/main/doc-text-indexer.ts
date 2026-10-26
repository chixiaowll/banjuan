import { utilityProcess, type UtilityProcess } from 'electron'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
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

type Reply = { id: number; pages?: Array<{ page: number; text: string }>; numPages?: number; error?: string; missing?: boolean; timedOut?: boolean }

// Documents that timed out once this session. A timeout can be a busy moment,
// so the first one is retried on a later pass; a second one marks it failed.
const timedOutOnce = new Set<string>()

/** One utility process running text-worker.ts, started when needed. */
class TextWorker {
  // Each process keeps its own waiting jobs: a killed process used to fail,
  // on its late 'exit', the jobs already sent to its replacement.
  private child: { proc: UtilityProcess; waiting: Map<number, (r: Reply) => void> } | null = null
  private nextId = 1
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  /** `idleMs`: stop the process after this long without work (it is started again when needed). */
  constructor(private idleMs = 0) {}

  private ensure() {
    if (this.child) return this.child
    const here = dirname(fileURLToPath(import.meta.url))
    const proc = utilityProcess.fork(join(here, '..', 'worker', 'text-worker.js'), [], { serviceName: 'Banjuan text index' })
    const entry = { proc, waiting: new Map<number, (r: Reply) => void>() }
    proc.postMessage({ type: 'init', loc: pdfjsLocation() })
    proc.on('message', (r: Reply) => { entry.waiting.get(r.id)?.(r); entry.waiting.delete(r.id) })
    proc.on('exit', (code) => {
      if (this.child === entry) this.child = null
      for (const [id, done] of entry.waiting) done({ id, error: `text worker exited (${code})` })
      entry.waiting.clear()
    })
    this.child = entry
    return entry
  }

  private run(message: Record<string, unknown>, timeoutMs: number): Promise<Reply> {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    const entry = this.ensure()
    const id = this.nextId++
    return new Promise<Reply>(resolve => {
      const timer = setTimeout(() => {
        entry.waiting.delete(id)
        resolve({ id, error: 'timed out', timedOut: true })
        // Forget it now, not on its 'exit': the next document went to the dying
        // process, got no answer and was failed after another full timeout.
        if (this.child === entry) this.child = null
        entry.proc.kill()
      }, timeoutMs)
      entry.waiting.set(id, r => { clearTimeout(timer); resolve(r) })
      entry.proc.postMessage({ ...message, id })
    }).finally(() => this.scheduleIdleStop())
  }

  private scheduleIdleStop(): void {
    if (!this.idleMs || this.child?.waiting.size) return
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => { this.idleTimer = null; if (!this.child?.waiting.size) this.stop() }, this.idleMs)
  }

  extract(path: string, docType: string): Promise<Reply> {
    return this.run({ type: 'extract', path, docType }, JOB_TIMEOUT_MS)
  }

  range(path: string, docType: string, fromPage: number, toPage: number): Promise<Reply> {
    return this.run({ type: 'range', path, docType, fromPage, toPage }, JOB_TIMEOUT_MS)
  }

  stop(): void {
    this.child?.proc.kill()
    this.child = null
  }
}

// Requests from the local API get their own process (stopped when idle), so
// they neither wait behind the index nor parse on the main process.
const onDemand = new TextWorker(60_000)

/** Pages `fromPage`–`toPage` of a document and its page count, extracted off the main process. */
export async function extractTextRange(path: string, docType: string, fromPage: number, toPage: number): Promise<{ numPages: number; pages: Array<{ page: number; text: string }> }> {
  const r = await onDemand.range(path, docType, fromPage, toPage)
  if (!r.pages) throw Object.assign(new Error(r.error ?? 'text extraction failed'), { code: r.missing ? 'ENOENT' : undefined })
  return { numPages: r.numPages ?? 1, pages: r.pages }
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
  onDemand.stop()
}

async function indexLibrary(lib: Library, stillOpen: () => boolean): Promise<void> {
  if (!lib.docText.available) return
  lib.docText.prune()
  // New and changed documents, each once per pass.
  const tried = new Set<string>()
  for (;;) {
    const jobs: DocTextJob[] = lib.docText.pending(BATCH + tried.size, { includeMissing: false }).filter(j => !tried.has(j.id)).slice(0, BATCH)
    if (!jobs.length) break
    for (const job of jobs) {
      tried.add(job.id)
      if (!stillOpen()) return
      await indexOne(lib, job, stillOpen)
    }
  }
  // Those whose file wasn't there last time: only once it is.
  for (const job of lib.docText.missing()) {
    if (!stillOpen()) return
    if (existsSync(join(lib.rootPath, job.path))) await indexOne(lib, job, stillOpen)
  }
}

async function indexOne(lib: Library, job: DocTextJob, stillOpen: () => boolean): Promise<void> {
  current = { library: lib.rootPath, title: job.path }
  const started = Date.now()
  const r = await worker!.extract(join(lib.rootPath, job.path), job.type)
  if (!stillOpen()) return   // closed meanwhile: its database is gone
  if (r.pages) {
    timedOutOnce.delete(job.id)
    lib.docText.store(job.id, job.hash, r.pages)
    console.log(`[doc-text] ${job.path}: ${r.pages.length} pages in ${Date.now() - started}ms`)
  } else {
    const retry = r.missing || (r.timedOut && !timedOutOnce.has(job.id))
    if (r.timedOut) timedOutOnce.add(job.id)
    lib.docText.markFailed(job.id, job.hash, retry ? 'missing' : 'failed', r.error ?? 'unknown error')
    console.warn(`[doc-text] ${job.path}: ${r.error}`)
  }
}
