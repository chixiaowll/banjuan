import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { SyncAdapter } from './adapter.js'
import type { StubData, DocumentSyncStatus } from '../types.js'

export class StubService {
  private stubsDir: string

  constructor(private rootPath: string, private adapter: SyncAdapter) {
    this.stubsDir = join(rootPath, '.banjuan', 'stubs')
  }

  private stubPath(id: string): string {
    return join(this.stubsDir, id.slice(0, 2), `${id}.stub.json`)
  }

  createStub(input: Omit<StubData, 'createdAt'>): void {
    const data: StubData = { ...input, createdAt: new Date().toISOString() }
    const path = this.stubPath(data.id)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2))
  }

  getStub(id: string): StubData | null {
    const path = this.stubPath(id)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  listStubs(): StubData[] {
    if (!existsSync(this.stubsDir)) return []
    const results: StubData[] = []
    const prefixes = readdirSync(this.stubsDir, { withFileTypes: true })
    for (const prefix of prefixes) {
      if (!prefix.isDirectory()) continue
      const files = readdirSync(join(this.stubsDir, prefix.name), { withFileTypes: true })
      for (const file of files) {
        if (!file.name.endsWith('.stub.json')) continue
        const content = readFileSync(join(this.stubsDir, prefix.name, file.name), 'utf-8')
        results.push(JSON.parse(content))
      }
    }
    return results
  }

  removeStub(id: string): void {
    const path = this.stubPath(id)
    if (existsSync(path)) unlinkSync(path)
  }

  async downloadFile(id: string, localPath: string): Promise<void> {
    const stub = this.getStub(id)
    if (!stub) throw new Error(`Stub not found: ${id}`)
    mkdirSync(dirname(localPath), { recursive: true })
    await this.adapter.download('/' + stub.remotePath, localPath)
    this.removeStub(id)
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.adapter.upload(localPath, '/' + remotePath)
  }

  getStatus(docId: string, localFilePath: string): DocumentSyncStatus {
    const hasLocal = existsSync(localFilePath)
    const hasStub = this.getStub(docId) !== null
    if (hasStub && !hasLocal) return 'cloud'
    if (hasLocal && !hasStub) return 'local'
    return 'local'
  }
}
