import type { PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { mapLimit } from './map-limit.js'
import { isSafeId } from './safe-path.js'

// Parallel reads per listAll (bounded: thread pool / Capacitor bridge).
const READ_CONCURRENCY = 32

export class JsonStore<T extends { id: string }> {
  /**
   * `isValid` drops records (from listAll) whose other fields would be unsafe
   * to use — e.g. a document path leading outside the library. The id itself
   * is always checked: files can come from a sync peer.
   */
  constructor(private baseDir: string, private fs: PlatformFS, private isValid?: (data: T) => boolean) {}

  private dirFor(id: string): string {
    if (!isSafeId(id)) throw new Error(`Invalid id: ${JSON.stringify(id)}`)
    return join(this.baseDir, id.slice(0, 2))
  }

  private pathFor(id: string): string {
    return join(this.dirFor(id), `${id}.json`)
  }

  async read(id: string): Promise<T | null> {
    if (!isSafeId(id)) return null
    const p = this.pathFor(id)
    if (!(await this.fs.exists(p))) return null
    const text = await this.fs.readTextFile(p)
    return JSON.parse(text)
  }

  async write(data: T): Promise<void> {
    const dir = this.dirFor(data.id)
    await this.fs.mkdir(dir, { recursive: true })
    await this.fs.writeTextFile(this.pathFor(data.id), JSON.stringify(data, null, 2))
  }

  async delete(id: string): Promise<boolean> {
    if (!isSafeId(id)) return false
    const p = this.pathFor(id)
    if (!(await this.fs.exists(p))) return false
    await this.fs.remove(p)
    return true
  }

  async listAll(): Promise<T[]> {
    if (!(await this.fs.exists(this.baseDir))) return []
    const prefixes = (await this.fs.readdirWithTypes(this.baseDir)).filter(p => p.isDirectory)
    const perPrefix = await mapLimit(prefixes, READ_CONCURRENCY, async (prefix) => {
      const dir = join(this.baseDir, prefix.name)
      return (await this.fs.readdirWithTypes(dir)).filter(f => f.name.endsWith('.json')).map(f => join(dir, f.name))
    })
    const parsed = await mapLimit(perPrefix.flat(), READ_CONCURRENCY, async (filePath) => {
      // One unreadable file (e.g. half-written by a crash before writes were
      // atomic) must not take down every list, rebuild and sync that uses this.
      try {
        const data = JSON.parse(await this.fs.readTextFile(filePath)) as T
        if (!isSafeId(data?.id) || (this.isValid && !this.isValid(data))) {
          console.warn('[JsonStore] skipping file with an unsafe id or path', filePath)
          return null
        }
        return data
      } catch (e) {
        console.warn('[JsonStore] skipping unreadable file', filePath, (e as Error)?.message)
        return null
      }
    })
    return parsed.filter((d): d is Awaited<T> => d !== null) as T[]
  }
}
