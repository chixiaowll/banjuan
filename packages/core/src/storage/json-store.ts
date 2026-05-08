import type { PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'

export class JsonStore<T extends { id: string }> {
  constructor(private baseDir: string, private fs: PlatformFS) {}

  private dirFor(id: string): string {
    return join(this.baseDir, id.slice(0, 2))
  }

  private pathFor(id: string): string {
    return join(this.dirFor(id), `${id}.json`)
  }

  async read(id: string): Promise<T | null> {
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
    const p = this.pathFor(id)
    if (!(await this.fs.exists(p))) return false
    await this.fs.remove(p)
    return true
  }

  async listAll(): Promise<T[]> {
    if (!(await this.fs.exists(this.baseDir))) return []
    const results: T[] = []
    const prefixes = await this.fs.readdirWithTypes(this.baseDir)
    for (const prefix of prefixes) {
      if (!prefix.isDirectory) continue
      const files = await this.fs.readdirWithTypes(join(this.baseDir, prefix.name))
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue
        const content = await this.fs.readTextFile(join(this.baseDir, prefix.name, file.name))
        results.push(JSON.parse(content))
      }
    }
    return results
  }
}
