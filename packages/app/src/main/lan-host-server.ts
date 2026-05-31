import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { handleDavRequest, generatePairing, type DavContext } from '@banjuan/core'
import type { PlatformFS } from '@banjuan/core'

export interface HostStatus {
  running: boolean
  url: string | null       // e.g. "http://192.168.1.20:51234"
  pin: string | null
  port: number | null
}

/** First non-internal IPv4 address, or 127.0.0.1 as fallback. */
function lanIPv4(): string {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address
    }
  }
  return '127.0.0.1'
}

export class LanHostServer {
  private server: Server | null = null
  private token = ''
  private pin = ''
  private port = 0

  constructor(private rootPath: string, private fs: PlatformFS) {}

  async start(): Promise<HostStatus> {
    if (this.server) return this.status()
    const pairing = generatePairing((n) => new Uint8Array(randomBytes(n)))
    this.token = pairing.token
    this.pin = pairing.pin

    let libraryId = ''
    let libraryName = ''
    try {
      const cfg = JSON.parse(await this.fs.readTextFile(join(this.rootPath, '.banjuan', 'config.json')))
      libraryId = cfg.id ?? ''
      libraryName = cfg.name ?? ''
    } catch { /* config unreadable — advertise empty identity */ }

    const ctx: DavContext = { rootPath: this.rootPath, fs: this.fs, token: this.token, pin: this.pin, libraryId, libraryName }

    this.server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('error', () => { /* aborted/erroring request stream — drop it, don't crash */ })
      req.on('data', (c) => chunks.push(c))
      req.on('end', async () => {
        try {
          const u = new URL(req.url || '/', 'http://localhost')
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '')
          const query: Record<string, string> = {}
          u.searchParams.forEach((v, k) => { query[k] = v })
          const body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined
          const out = await handleDavRequest(
            { method: req.method || 'GET', path: decodeURIComponent(u.pathname), headers, query, body }, ctx)
          res.statusCode = out.status
          for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
          if (out.body == null) res.end()
          else if (typeof out.body === 'string') res.end(out.body)
          else res.end(Buffer.from(out.body))
        } catch (err) {
          res.statusCode = 500
          res.end(String((err as Error)?.message ?? err))
        }
      })
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      this.server!.once('error', onError)
      this.server!.listen(0, '0.0.0.0', () => {
        this.server!.removeListener('error', onError)   // don't leave a stale one-shot reject handler
        resolve()
      })
    })
    this.port = (this.server!.address() as { port: number }).port
    return this.status()
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    this.server = null
    this.token = ''
    this.pin = ''
    this.port = 0
  }

  status(): HostStatus {
    if (!this.server) return { running: false, url: null, pin: null, port: null }
    return { running: true, url: `http://${lanIPv4()}:${this.port}`, pin: this.pin, port: this.port }
  }
}
