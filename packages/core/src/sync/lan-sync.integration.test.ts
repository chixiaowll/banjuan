import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS, NodeCrypto } from '@banjuan/platform-node'
import { WebDAVAdapter, SyncService } from '../index.js'
import { handleDavRequest, type DavContext } from './lan-host-handler.js'

const TOKEN = 'integtoken'

function startServer(ctx: DavContext): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', async () => {
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
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({ server, port })
    })
  })
}

describe('LAN sync integration (webdav client ↔ handler)', () => {
  let hostRoot: string
  let clientRoot: string
  let server: Server
  let port: number

  beforeEach(async () => {
    hostRoot = mkdtempSync(join(tmpdir(), 'lan-host-'))
    clientRoot = mkdtempSync(join(tmpdir(), 'lan-client-'))
    mkdirSync(join(hostRoot, '.banjuan'), { recursive: true })
    mkdirSync(join(clientRoot, '.banjuan'), { recursive: true })
    const ctx: DavContext = { rootPath: hostRoot, fs: new NodeFS(), token: TOKEN, pin: '111111' }
    const started = await startServer(ctx)
    server = started.server
    port = started.port
  })

  afterEach(() => { server.close() })

  it('downloads host-only files to client (host -> client)', async () => {
    writeFileSync(join(hostRoot, 'paper.pdf'), 'HOSTDATA')
    const adapter = new WebDAVAdapter(new NodeFS())
    await adapter.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
    const result = await svc.sync()
    expect(result.errors).toEqual([])
    expect(result.downloaded).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(clientRoot, 'paper.pdf'))).toBe(true)
    expect(readFileSync(join(clientRoot, 'paper.pdf'), 'utf-8')).toBe('HOSTDATA')
  })

  it('uploads client-only files to host (client -> host)', async () => {
    writeFileSync(join(clientRoot, 'mynote.md'), 'CLIENTNOTE')
    const adapter = new WebDAVAdapter(new NodeFS())
    await adapter.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
    const result = await svc.sync()
    expect(result.errors).toEqual([])
    expect(result.uploaded).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(hostRoot, 'mynote.md'))).toBe(true)
    expect(readFileSync(join(hostRoot, 'mynote.md'), 'utf-8')).toBe('CLIENTNOTE')
  })

  it('does not expose excluded files (db.sqlite stays on host only)', async () => {
    writeFileSync(join(hostRoot, 'db.sqlite'), 'CACHE')
    const adapter = new WebDAVAdapter(new NodeFS())
    await adapter.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, adapter, undefined, new NodeFS(), '/')
    await svc.sync()
    expect(existsSync(join(clientRoot, 'db.sqlite'))).toBe(false)
  })

  it('host -> client converges: second sync transfers nothing', async () => {
    writeFileSync(join(hostRoot, 'paper.pdf'), 'HOSTDATA')
    const connect = async () => {
      const a = new WebDAVAdapter(new NodeFS())
      await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
      return new SyncService(clientRoot, a, undefined, new NodeFS(), '/')
    }
    const first = await (await connect()).sync()
    expect(first.downloaded).toBeGreaterThanOrEqual(1)
    expect(first.errors).toEqual([])

    const second = await (await connect()).sync()
    expect(second.downloaded).toBe(0)
    expect(second.uploaded).toBe(0)
    expect(second.errors).toEqual([])
  })

  it('client -> host converges: second sync transfers nothing', async () => {
    writeFileSync(join(clientRoot, 'mynote.md'), 'CLIENTNOTE')
    const connect = async () => {
      const a = new WebDAVAdapter(new NodeFS())
      await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
      return new SyncService(clientRoot, a, undefined, new NodeFS(), '/')
    }
    const first = await (await connect()).sync()
    expect(first.uploaded).toBeGreaterThanOrEqual(1)
    expect(first.errors).toEqual([])

    const second = await (await connect()).sync()
    expect(second.uploaded).toBe(0)
    expect(second.downloaded).toBe(0)
    expect(second.errors).toEqual([])
  })

  it('true conflict keeps both versions: host wins the name, local edit saved as a .sync-conflict copy', async () => {
    const connect = async () => {
      const a = new WebDAVAdapter(new NodeFS())
      await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
      return new SyncService(clientRoot, a, undefined, new NodeFS(), '/', new NodeCrypto(), 'client')
    }
    // Establish a shared baseline (both sides have V1).
    writeFileSync(join(clientRoot, 'note.md'), 'V1')
    const first = await (await connect()).sync()
    expect(first.errors).toEqual([])
    expect(readFileSync(join(hostRoot, 'note.md'), 'utf-8')).toBe('V1')

    // Both sides edit the same file differently → a genuine conflict.
    writeFileSync(join(clientRoot, 'note.md'), 'CLIENT_EDIT')
    writeFileSync(join(hostRoot, 'note.md'), 'HOST_EDIT')
    const future = new Date(Date.now() + 10_000)
    utimesSync(join(hostRoot, 'note.md'), future, future) // ensure the remote reads as "changed"

    const second = await (await connect()).sync()
    expect(second.conflicts).toBe(1)
    // Host takes the canonical name…
    expect(readFileSync(join(clientRoot, 'note.md'), 'utf-8')).toBe('HOST_EDIT')
    // …and the local edit survives in a conflict copy (zero data loss).
    const copy = readdirSync(clientRoot).find(f => f.startsWith('note.sync-conflict-') && f.endsWith('.md'))
    expect(copy).toBeTruthy()
    expect(readFileSync(join(clientRoot, copy!), 'utf-8')).toBe('CLIENT_EDIT')
  })

  it('false conflict (both ended identical) makes no copy', async () => {
    const connect = async () => {
      const a = new WebDAVAdapter(new NodeFS())
      await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
      return new SyncService(clientRoot, a, undefined, new NodeFS(), '/', new NodeCrypto(), 'client')
    }
    writeFileSync(join(clientRoot, 'note.md'), 'V1')
    await (await connect()).sync()

    // Local edits to V2; host also ends at the identical V2; bump host mtime so it
    // reads as "changed" → reconcile flags a conflict, but content is identical.
    writeFileSync(join(clientRoot, 'note.md'), 'V2')
    writeFileSync(join(hostRoot, 'note.md'), 'V2')
    const future = new Date(Date.now() + 10_000)
    utimesSync(join(hostRoot, 'note.md'), future, future)

    const second = await (await connect()).sync()
    expect(second.conflicts).toBe(0)
    expect(readdirSync(clientRoot).some(f => f.includes('.sync-conflict-'))).toBe(false)
  })

  it('does not sync .banjuan/config.json (identity stays local)', async () => {
    writeFileSync(join(hostRoot, '.banjuan', 'config.json'), JSON.stringify({ id: 'HOSTID', name: 'HostRoom', version: '1', createdAt: 'x' }))
    writeFileSync(join(clientRoot, '.banjuan', 'config.json'), JSON.stringify({ id: 'CLIENTID', name: 'ClientRoom', version: '1', createdAt: 'y' }))
    // Make the host config clearly NEWER — WITHOUT the exclusion the remote-newer
    // rule would download it and clobber the client's id, so this test only passes
    // because config.json is excluded from sync (a genuine red→green guard).
    const { utimesSync } = await import('node:fs')
    const future = new Date(Date.now() + 10_000)
    utimesSync(join(hostRoot, '.banjuan', 'config.json'), future, future)
    const a = new WebDAVAdapter(new NodeFS())
    await a.connect({ type: 'webdav', url: `http://127.0.0.1:${port}`, username: 'banjuan', password: TOKEN, remotePath: '/' })
    const svc = new SyncService(clientRoot, a, undefined, new NodeFS(), '/')
    await svc.sync()
    const clientCfg = JSON.parse(readFileSync(join(clientRoot, '.banjuan', 'config.json'), 'utf-8'))
    expect(clientCfg.id).toBe('CLIENTID')
    const hostCfg = JSON.parse(readFileSync(join(hostRoot, '.banjuan', 'config.json'), 'utf-8'))
    expect(hostCfg.id).toBe('HOSTID')
  })
})
