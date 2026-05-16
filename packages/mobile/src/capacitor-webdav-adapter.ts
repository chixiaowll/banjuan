import { CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import type { PlatformFS } from '@banjuan/core'
import { dirname } from '@banjuan/core'
import type { SyncConfig, RemoteFile } from '@banjuan/core'
import type { SyncAdapter } from '@banjuan/core'
import { FileUploader } from './file-uploader-plugin'

export class CapacitorWebDAVAdapter implements SyncAdapter {
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

  private buildUrl(remotePath: string): string {
    const encoded = remotePath.split('/').map(p => encodeURIComponent(p)).join('/')
    return this.baseUrl + encoded
  }

  async list(remotePath: string): Promise<RemoteFile[]> {
    const results: RemoteFile[] = []
    const queue = [remotePath.endsWith('/') ? remotePath : remotePath + '/']

    while (queue.length > 0) {
      const dir = queue.shift()!
      const t0 = performance.now()
      const resp = await CapacitorHttp.request({
        method: 'PROPFIND',
        url: this.buildUrl(dir),
        headers: { ...this.headers, 'Depth': '1', 'Content-Type': 'application/xml' },
      })
      console.log(`[sync] PROPFIND ${dir} ${resp.status} ${(performance.now() - t0).toFixed(0)}ms`)
      console.log(`[sync] resp.data type: ${typeof resp.data}`, typeof resp.data === 'string' ? resp.data.substring(0, 200) : resp.data)
      if (resp.status >= 400) { console.warn(`[sync] PROPFIND ${dir} failed: ${resp.status}, skipping`); continue }

      const xml = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
      const entries = this.parsePropfind(xml, dir)
      for (const entry of entries) {
        if (entry.isDirectory) {
          queue.push(entry.path.endsWith('/') ? entry.path : entry.path + '/')
        }
        results.push(entry)
      }
    }
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
      let href = hrefEl.textContent || ''

      try {
        const parsed = new URL(href, this.baseUrl)
        href = decodeURIComponent(parsed.pathname)
      } catch {
        href = decodeURIComponent(href)
      }

      const normalizedDir = requestDir.endsWith('/') ? requestDir : requestDir + '/'
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
    const url = this.buildUrl(remotePath)
    const uri = await Filesystem.getUri({ path: localPath, directory: Directory.Documents })
    const result = await FileUploader.upload({
      filePath: uri.uri,
      serverUrl: url,
      method: 'PUT',
      headers: { ...this.headers, 'Content-Type': 'application/octet-stream' },
    })
    console.log(`[sync] PUT ${remotePath} ${result.status} ${(performance.now() - t0).toFixed(0)}ms`)
  }

  async download(remotePath: string, localPath: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
    const t0 = performance.now()
    await this.fs.mkdir(dirname(localPath), { recursive: true })
    await Filesystem.downloadFile({
      url: this.buildUrl(remotePath),
      path: localPath,
      directory: Directory.Documents,
      headers: this.headers,
      recursive: true,
      progress: !!onProgress,
    })
    console.log(`[sync] GET ${remotePath} ${(performance.now() - t0).toFixed(0)}ms`)
    onProgress?.({ loaded: 1, total: 1 })
  }

  async delete(remotePath: string): Promise<void> {
    const resp = await CapacitorHttp.request({
      method: 'DELETE',
      url: this.buildUrl(remotePath),
      headers: this.headers,
    })
    if (resp.status >= 400) throw new Error(`DELETE ${remotePath}: ${resp.status}`)
  }

  async getMetadata(remotePath: string): Promise<{ mtime: number; size: number }> {
    const resp = await CapacitorHttp.request({
      method: 'PROPFIND',
      url: this.buildUrl(remotePath),
      headers: { ...this.headers, 'Depth': '0' },
    })
    if (resp.status >= 400) throw new Error(`PROPFIND ${remotePath}: ${resp.status}`)

    const xml = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
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
    const parts = remotePath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      const resp = await CapacitorHttp.request({
        method: 'MKCOL',
        url: this.buildUrl(current),
        headers: this.headers,
      })
      // 405 = already exists, 301 = redirect (some servers)
      if (resp.status >= 400 && resp.status !== 405) {
        // ignore
      }
    }
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToUint8(_base64: string): Uint8Array {
    const binary = atob(_base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}
