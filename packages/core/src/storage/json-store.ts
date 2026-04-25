import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export class JsonStore<T extends { id: string }> {
  constructor(private baseDir: string) {}

  private dirFor(id: string): string {
    return join(this.baseDir, id.slice(0, 2))
  }

  private pathFor(id: string): string {
    return join(this.dirFor(id), `${id}.json`)
  }

  read(id: string): T | null {
    const p = this.pathFor(id)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  write(data: T): void {
    const dir = this.dirFor(data.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.pathFor(data.id), JSON.stringify(data, null, 2))
  }

  delete(id: string): boolean {
    const p = this.pathFor(id)
    if (!existsSync(p)) return false
    unlinkSync(p)
    return true
  }

  listAll(): T[] {
    if (!existsSync(this.baseDir)) return []
    const results: T[] = []
    const prefixes = readdirSync(this.baseDir, { withFileTypes: true })
    for (const prefix of prefixes) {
      if (!prefix.isDirectory()) continue
      const files = readdirSync(join(this.baseDir, prefix.name), { withFileTypes: true })
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue
        const content = readFileSync(join(this.baseDir, prefix.name, file.name), 'utf-8')
        results.push(JSON.parse(content))
      }
    }
    return results
  }
}
