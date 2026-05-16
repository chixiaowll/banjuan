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

  async upload(localPath: string, remotePath: string): Promise<void> {
    const client = this.getClient()
    const content = await this.fs.readFile(localPath)
    await client.putFileContents(remotePath, Buffer.from(content))
  }

  async download(remotePath: string, localPath: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    const client = this.getClient()
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
