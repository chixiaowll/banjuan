import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { handleDavRequest, isDavAuthorized, isPublicDavRoute, generatePairing, PairLimiter, LAN_PREFERRED_PORTS, type DavContext } from '@banjuan/core'
import { PairingStore } from '@banjuan/core'
import type { PlatformFS } from '@banjuan/core'
import { getDeviceIdentity } from './device-identity.js'

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

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

  /** `onPeerWrite` runs after a peer changed files here (PUT / DELETE / MKCOL / MOVE succeeded). */
  constructor(private rootPath: string, private fs: PlatformFS, private onPeerWrite?: () => void) {}

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

    const identity = getDeviceIdentity()
    const pairingStore = new PairingStore(this.rootPath, this.fs)

    const ctx: DavContext = {
      rootPath: this.rootPath, fs: this.fs, token: this.token, pin: this.pin,
      libraryId, libraryName,
      deviceId: identity.deviceId, deviceName: identity.deviceName,
      isValidToken: (t) => pairingStore.hasToken(t),
      recordPairing: async (peerDeviceId, peerDeviceName, peerLibraryId) => {
        const token = toHex(randomBytes(16))
        await pairingStore.addOrUpdate({ peerDeviceId, peerDeviceName, peerLibraryId, token })
        return token
      },
      // 5 wrong PINs → pairing refused for 60s; a used PIN is replaced (one-time).
      pairLimiter: new PairLimiter(),
      onPaired: () => {
        this.pin = generatePairing((n) => new Uint8Array(randomBytes(n))).pin
        ctx.pin = this.pin
      },
    }

    this.server = createServer(async (req, res) => {
      req.on('error', () => { /* aborted/erroring request stream — drop it, don't crash */ })
      try {
        const u = new URL(req.url || '/', 'http://localhost')
        const method = req.method || 'GET'
        const path = decodeURIComponent(u.pathname)
        const headers: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '')
        const query: Record<string, string> = {}
        u.searchParams.forEach((v, k) => { query[k] = v })

        // Authenticate from the headers BEFORE reading the body: buffering first
        // let any stranger on the LAN fill this process's memory with one upload.
        let body: Uint8Array | undefined
        if (isPublicDavRoute(method, path, ctx)) {
          req.resume()   // public routes take no body; discard it
        } else if (!(await isDavAuthorized(headers, ctx))) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="banjuan"', Connection: 'close' })
          res.end('Unauthorized')
          // Discard (never buffer) the body so a normal client still reads the
          // 401; cut the connection if a stranger keeps streaming past 1 MB.
          let discarded = 0
          req.on('data', (c: Buffer) => { discarded += c.length; if (discarded > 1 << 20) req.destroy() })
          req.resume()
          return
        } else {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined
        }

        const out = await handleDavRequest({ method, path, headers, query, body }, ctx)
        if (out.status < 300 && /^(PUT|DELETE|MKCOL|MOVE|COPY)$/i.test(method)) this.onPeerWrite?.()
        res.statusCode = out.status
        for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
        if (out.body == null) res.end()
        else if (typeof out.body === 'string') res.end(out.body)
        else res.end(Buffer.from(out.body))
      } catch (err) {
        if (res.headersSent) { res.destroy(); return }
        res.statusCode = 500
        res.end(String((err as Error)?.message ?? err))
      }
    })

    // Try the preferred fixed ports in order (so clients can probe known
    // addresses), then fall back to an ephemeral port (0) if all are taken.
    const tryListen = (port: number) => new Promise<boolean>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        this.server!.removeListener('listening', onListening)
        if (err.code === 'EADDRINUSE') resolve(false)   // port taken, try the next
        else reject(err)
      }
      const onListening = () => {
        this.server!.removeListener('error', onError)
        resolve(true)
      }
      this.server!.once('error', onError)
      this.server!.once('listening', onListening)
      this.server!.listen(port, '0.0.0.0')
    })
    let bound = false
    for (const p of LAN_PREFERRED_PORTS) {
      if (await tryListen(p)) { bound = true; break }
    }
    if (!bound) await tryListen(0)   // ephemeral fallback (throws on real errors)
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
