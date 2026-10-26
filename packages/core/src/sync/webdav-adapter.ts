import { createClient, AuthType, type WebDAVClient } from 'webdav'
import type { PlatformFS } from '../platform/index.js'
import { dirname } from '../platform/path.js'
import type { SyncConfig, RemoteFile } from '../types.js'
import type { SyncAdapter } from './adapter.js'

interface WebDAVStat {
  filename: string
  basename: string
  lastmod: string
  size: number
  type: 'file' | 'directory'
}

// Files above this go through streams when the platform has them (desktop):
// reading a multi-GB video into one buffer ran out of memory, and past 2 GB
// Node can't even allocate it.
const STREAM_BYTES = 16 * 1024 * 1024

export class WebDAVAdapter implements SyncAdapter {
  private client: WebDAVClient | null = null

  constructor(private fs: PlatformFS) {}

  async connect(config: SyncConfig): Promise<void> {
    this.client = createClient(config.url, {
      authType: AuthType.Password,
      username: config.username,
      password: config.password,
    })
  }

  async disconnect(): Promise<void> {
    this.client = null
  }

  private getClient(): WebDAVClient {
    if (!this.client) throw new Error('Not connected')
    return this.client
  }

  async list(remotePath: string): Promise<RemoteFile[]> {
    const client = this.getClient()
    const results: RemoteFile[] = []
    const queue = [remotePath.endsWith('/') ? remotePath : remotePath + '/']
    while (queue.length > 0) {
      const dir = queue.shift()!
      const items = (await client.getDirectoryContents(dir)) as WebDAVStat[]
      for (const item of items) {
        if (item.type === 'directory') {
          queue.push(item.filename.endsWith('/') ? item.filename : item.filename + '/')
          results.push({ path: item.filename, mtime: new Date(item.lastmod).getTime(), size: item.size, isDirectory: true })
        } else {
          results.push({ path: item.filename, mtime: new Date(item.lastmod).getTime(), size: item.size, isDirectory: false })
        }
      }
    }
    return results
  }

  async upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void> {
    const client = this.getClient()
    const headers = mtimeMs && mtimeMs > 0 ? { 'X-Banjuan-Mtime': String(mtimeMs) } : undefined
    if (this.fs.openReadStream) {
      const { size } = await this.fs.stat(localPath)
      if (size > STREAM_BYTES) {
        await client.putFileContents(remotePath, this.fs.openReadStream(localPath) as any, { contentLength: size, headers })
        return
      }
    }
    const content = await this.fs.readFile(localPath)
    await client.putFileContents(remotePath, Buffer.from(content), headers ? { headers } : undefined)
  }

  async download(remotePath: string, localPath: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    const client = this.getClient()
    if (this.fs.writeStream) {
      const total = onProgress ? ((await client.stat(remotePath)) as WebDAVStat).size : 0
      const stream = client.createReadStream(remotePath)
      if (onProgress) {
        let loaded = 0
        stream.on('data', (chunk: { length: number }) => { loaded += chunk.length; onProgress({ loaded, total }) })
      }
      await this.fs.mkdir(dirname(localPath), { recursive: true })
      await this.fs.writeStream(localPath, stream)
      return
    }
    const content = (await client.getFileContents(remotePath, {
      onDownloadProgress: onProgress,
    })) as ArrayBuffer
    await this.fs.mkdir(dirname(localPath), { recursive: true })
    await this.fs.writeFile(localPath, new Uint8Array(content))
  }

  async delete(remotePath: string): Promise<void> {
    const client = this.getClient()
    await client.deleteFile(remotePath)
  }

  async getMetadata(
    remotePath: string,
  ): Promise<{ mtime: number; size: number }> {
    const client = this.getClient()
    const stat = (await client.stat(remotePath)) as WebDAVStat
    return {
      mtime: new Date(stat.lastmod).getTime(),
      size: stat.size,
    }
  }

  async mkdir(remotePath: string): Promise<void> {
    const client = this.getClient()
    await client.createDirectory(remotePath, { recursive: true })
  }
}
