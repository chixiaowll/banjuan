import { readFileSync } from 'node:fs'
import { writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Per-file view state of files opened on their own (single-file windows):
 * reading position and the like, keyed by real path. Kept on this device only
 * (the app's data folder), never in the file itself or a library. Only the
 * most recent `max` files are kept; using a file again makes it recent.
 */
export class FileViewStateStore {
  private entries: Map<string, Record<string, unknown>>
  private timer: ReturnType<typeof setTimeout> | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private file: string, private max = 500) {
    this.entries = new Map()
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8'))
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [path, state] of Object.entries(raw)) {
          if (state && typeof state === 'object') this.entries.set(path, state as Record<string, unknown>)
        }
      }
    } catch { /* none yet, or damaged: start empty */ }
  }

  get(path: string): Record<string, unknown> {
    return this.entries.get(path) ?? {}
  }

  set(path: string, state: Record<string, unknown>): void {
    this.entries.delete(path)   // re-inserted below: now the most recent
    this.entries.set(path, state)
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value as string
      this.entries.delete(oldest)
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.write() }, 300)
  }

  /** Write a pending change now (before quitting). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      await this.write()
    }
    await this.writing
  }

  private write(): Promise<void> {
    const text = JSON.stringify(Object.fromEntries(this.entries))
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(dirname(this.file), { recursive: true })
        const tmp = `${this.file}.${process.pid}.tmp`
        await writeFile(tmp, text)
        await rename(tmp, this.file)
      } catch (e) {
        console.warn('[file-view-state] saving failed', e)
      }
    })
    return this.writing
  }
}
