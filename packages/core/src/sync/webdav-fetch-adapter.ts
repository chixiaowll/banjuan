import type { PlatformFS } from '../platform/index.js'
import { dirname } from '../platform/path.js'
import type { SyncConfig, RemoteFile } from '../types.js'
import type { SyncAdapter } from './adapter.js'

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
    const queue = [remotePath.endsWith('/') ? remotePath : remotePath + '/']

    while (queue.length > 0) {
      const dir = queue.shift()!
      const t1 = performance.now()
      const resp = await fetch(this.url(dir), {
        method: 'PROPFIND',
        headers: { ...this.headers, 'Depth': '1', 'Content-Type': 'application/xml' },
      })
      if (!resp.ok) throw new Error(`PROPFIND ${dir}: ${resp.status} ${resp.statusText}`)

      const xml = await resp.text()
      console.log(`[sync] PROPFIND ${dir} took ${(performance.now() - t1).toFixed(0)}ms`)
      const entries = this.parsePropfind(xml, dir)
      for (const entry of entries) {
        if (entry.isDirectory) {
          queue.push(entry.path.endsWith('/') ? entry.path : entry.path + '/')
        }
        results.push(entry)
      }
    }
    console.log(`[sync] list total: ${(performance.now() - t0).toFixed(0)}ms, ${results.length} items`)
    return results
  }

  private parsePropfind(xml: string, requestDir: string): RemoteFile[] {
    const results: RemoteFile[] = []
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const responses = doc.getElementsByTagNameNS('DAV:', 'response')

    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i]
      const hrefEl = resp.getElementsByTagNameNS('DAV:', 'href')[0]
      if (!hrefEl) continue
      let href = decodeURIComponent(hrefEl.textContent || '')

      // Remove base URL prefix if present
      try {
        const parsed = new URL(href, this.baseUrl)
        href = parsed.pathname
      } catch {
        // already a path
      }

      // Skip the directory itself
      const normalizedDir = requestDir.endsWith('/') ? requestDir : requestDir + '/'
      const normalizedHref = href.endsWith('/') ? href : href
      if (normalizedHref === normalizedDir || normalizedHref === normalizedDir.slice(0, -1)) continue
      // Also skip if href without trailing slash matches dir without trailing slash
      if (href.replace(/\/$/, '') === requestDir.replace(/\/$/, '')) continue

      const isDirectory = resp.getElementsByTagNameNS('DAV:', 'collection').length > 0
      const lastmodEl = resp.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]
      const sizeEl = resp.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]

      const path = href.replace(/\/$/, '')
      const mtime = lastmodEl ? new Date(lastmodEl.textContent || '').getTime() : 0
      const size = sizeEl ? parseInt(sizeEl.textContent || '0', 10) : 0

      results.push({ path, mtime, size, isDirectory })
    }
    return results
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const t0 = performance.now()
    const content = await this.fs.readFile(localPath)
    const resp = await fetch(this.url(remotePath), {
      method: 'PUT',
      headers: this.headers,
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
