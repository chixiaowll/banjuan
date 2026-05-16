import type { PlatformFS } from '../platform/index.js'
import { join, dirname } from '../platform/path.js'
import type { SyncAdapter } from './adapter.js'
import type { StubData, DocumentSyncStatus } from '../types.js'

export class StubService {
  private stubsDir: string

  constructor(private rootPath: string, private adapter: SyncAdapter, private fs: PlatformFS) {
    this.stubsDir = join(rootPath, '.banjuan', 'stubs')
  }

  private stubPath(id: string): string {
    return join(this.stubsDir, id.slice(0, 2), `${id}.stub.json`)
  }

  async createStub(input: Omit<StubData, 'createdAt'>): Promise<void> {
    const data: StubData = { ...input, createdAt: new Date().toISOString() }
    const path = this.stubPath(data.id)
    await this.fs.mkdir(dirname(path), { recursive: true })
    await this.fs.writeTextFile(path, JSON.stringify(data, null, 2))
  }

  async getStub(id: string): Promise<StubData | null> {
    const path = this.stubPath(id)
    if (!(await this.fs.exists(path))) return null
    return JSON.parse(await this.fs.readTextFile(path))
  }

  async listStubs(): Promise<StubData[]> {
    if (!(await this.fs.exists(this.stubsDir))) return []
    const results: StubData[] = []
    const prefixes = await this.fs.readdirWithTypes(this.stubsDir)
    for (const prefix of prefixes) {
      if (!prefix.isDirectory) continue
      const files = await this.fs.readdirWithTypes(join(this.stubsDir, prefix.name))
      for (const file of files) {
        if (!file.name.endsWith('.stub.json')) continue
        const content = await this.fs.readTextFile(join(this.stubsDir, prefix.name, file.name))
        results.push(JSON.parse(content))
      }
    }
    return results
  }

  async removeStub(id: string): Promise<void> {
    const path = this.stubPath(id)
    if (await this.fs.exists(path)) await this.fs.remove(path)
  }

  async downloadFile(id: string, localPath: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    const stub = await this.getStub(id)
    if (!stub) throw new Error(`Stub not found: ${id}`)
    await this.fs.mkdir(dirname(localPath), { recursive: true })
    await this.adapter.download('/' + stub.remotePath, localPath, onProgress)
    await this.removeStub(id)
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.adapter.upload(localPath, '/' + remotePath)
  }

  async findByRemotePath(remotePath: string): Promise<StubData | null> {
    const stubs = await this.listStubs()
    return stubs.find(s => s.remotePath === remotePath) ?? null
  }

  async getStatus(docId: string, localFilePath: string): Promise<DocumentSyncStatus> {
    const hasLocal = await this.fs.exists(localFilePath)
    const hasStub = (await this.getStub(docId)) !== null
    if (hasStub && !hasLocal) return 'cloud'
    if (hasLocal && !hasStub) return 'local'
    return 'local'
  }
}
