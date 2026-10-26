import type { PlatformFS } from '../platform/index.js'
import { dirname } from '../platform/path.js'
import type { SyncConfig, RemoteFile } from '../types.js'
import type { SyncAdapter } from './adapter.js'
import { parsePropfind } from './propfind.js'

export class WebDAVFetchAdapter implements SyncAdapter {
  private baseUrl = ''
  private headers: Record<string, string> = {}

  constructor(private fs: PlatformFS) {}

  async connect(config: SyncConfig): Promise<void> {
    this.baseUrl = config.url.replace(/\/$/, '')
    this.headers = {
      'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
    }
  }

  async disconnect(): Promise<void> {
    this.baseUrl = ''
    this.headers = {}
  }

  private url(remotePath: string): string {
    const encoded = remotePath.split('/').map(s => encodeURIComponent(s)).join('/')
    return this.baseUrl + encoded
  }

  async list(remotePath: string): Promise<RemoteFile[]> {
    const t0 = performance.now()
    const results: RemoteFile[] = []
    const root = remotePath.endsWith('/') ? remotePath : remotePath + '/'
    const queue = [root]

    while (queue.length > 0) {
      const dir = queue.shift()!
      const resp = await fetch(this.url(dir), {
        method: 'PROPFIND',
        headers: { ...this.headers, 'Depth': '1', 'Content-Type': 'application/xml' },
      })
      if (resp.status === 404 && dir === root) return []   // nothing synced here yet
      if (!resp.ok) throw Object.assign(new Error(`PROPFIND ${dir}: ${resp.status} ${resp.statusText}`), { status: resp.status })
      for (const entry of parsePropfind(await resp.text(), dir, this.baseUrl)) {
        if (entry.isDirectory) queue.push(entry.path + '/')
        results.push(entry)
      }
    }
    console.log(`[sync] list total: ${(performance.now() - t0).toFixed(0)}ms, ${results.length} items`)
    return results
  }

  async upload(localPath: string, remotePath: string, mtimeMs?: number): Promise<void> {
    const t0 = performance.now()
    const content = await this.fs.readFile(localPath)
    const headers: Record<string, string> = { ...this.headers }
    if (mtimeMs && mtimeMs > 0) headers['X-Banjuan-Mtime'] = String(mtimeMs)
    const resp = await fetch(this.url(remotePath), {
      method: 'PUT',
      headers,
      body: content.buffer as ArrayBuffer,
    })
    if (!resp.ok) throw new Error(`PUT ${remotePath}: ${resp.status} ${resp.statusText}`)
    console.log(`[sync] PUT ${remotePath} (${content.length}B) took ${(performance.now() - t0).toFixed(0)}ms`)
  }

  async download(remotePath: string, localPath: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    const resp = await fetch(this.url(remotePath), {
      method: 'GET',
      headers: this.headers,
    })
    if (!resp.ok) throw new Error(`GET ${remotePath}: ${resp.status} ${resp.statusText}`)

    const total = parseInt(resp.headers.get('content-length') || '0', 10)

    if (onProgress && resp.body) {
      const reader = resp.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        onProgress({ loaded, total })
      }
      const result = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      await this.fs.mkdir(dirname(localPath), { recursive: true })
      await this.fs.writeFile(localPath, result)
    } else {
      const buffer = await resp.arrayBuffer()
      await this.fs.mkdir(dirname(localPath), { recursive: true })
      await this.fs.writeFile(localPath, new Uint8Array(buffer))
    }
  }

  async delete(remotePath: string): Promise<void> {
    const resp = await fetch(this.url(remotePath), {
      method: 'DELETE',
      headers: this.headers,
    })
    if (!resp.ok) throw new Error(`DELETE ${remotePath}: ${resp.status} ${resp.statusText}`)
  }

  async getMetadata(remotePath: string): Promise<{ mtime: number; size: number }> {
    const resp = await fetch(this.url(remotePath), {
      method: 'PROPFIND',
      headers: { ...this.headers, 'Depth': '0' },
    })
    if (!resp.ok) throw new Error(`PROPFIND ${remotePath}: ${resp.status} ${resp.statusText}`)

    const xml = await resp.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const lastmodEl = doc.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]
    const sizeEl = doc.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]

    return {
      mtime: lastmodEl ? new Date(lastmodEl.textContent || '').getTime() : 0,
      size: sizeEl ? parseInt(sizeEl.textContent || '0', 10) : 0,
    }
  }

  async mkdir(remotePath: string): Promise<void> {
    const t0 = performance.now()
    const parts = remotePath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      const resp = await fetch(this.url(current), {
        method: 'MKCOL',
        headers: this.headers,
      })
      if (!resp.ok && resp.status !== 405) {
        // 405 = already exists
      }
    }
    console.log(`[sync] MKCOL ${remotePath} took ${(performance.now() - t0).toFixed(0)}ms`)
  }
}
