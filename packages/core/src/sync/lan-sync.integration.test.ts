import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
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

  it('does not sync .banjuan/config.json (identity stays local)', async () => {
    writeFileSync(join(hostRoot, '.banjuan', 'config.json'), JSON.stringify({ id: 'HOSTID', name: 'HostRoom', version: '1', createdAt: 'x' }))
    writeFileSync(join(clientRoot, '.banjuan', 'config.json'), JSON.stringify({ id: 'CLIENTID', name: 'ClientRoom', version: '1', createdAt: 'y' }))
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
