import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { handleDavRequest, type DavContext } from './lan-host-handler.js'

function basic(token: string): string {
  return 'Basic ' + Buffer.from('banjuan:' + token).toString('base64')
}

describe('lan-host-handler', () => {
  let root: string
  let ctx: DavContext

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lanhost-'))
    mkdirSync(join(root, '.banjuan'), { recursive: true })
    writeFileSync(join(root, 'book.pdf'), 'PDF-DATA')
    writeFileSync(join(root, 'db.sqlite'), 'SHOULD-BE-HIDDEN')
    ctx = { rootPath: root, fs: new NodeFS(), token: 'secrettoken', pin: '123456', libraryId: 'LIB123', libraryName: 'My Room' }
  })

  it('pairing response includes the host library identity', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '123456' } }, ctx)
    expect(res.status).toBe(200)
    const body = JSON.parse(String(res.body))
    expect(body.token).toBe('secrettoken')
    expect(body.libraryId).toBe('LIB123')
    expect(body.libraryName).toBe('My Room')
  })

  it('pairing endpoint returns token for correct PIN, 403 otherwise (no auth needed)', async () => {
    const ok = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '123456' } }, ctx)
    expect(ok.status).toBe(200)
    expect(JSON.parse(String(ok.body)).token).toBe('secrettoken')

    const bad = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '000000' } }, ctx)
    expect(bad.status).toBe(403)
  })

  it('rejects unauthenticated WebDAV requests with 401', async () => {
    const res = await handleDavRequest({ method: 'GET', path: '/book.pdf', headers: {} }, ctx)
    expect(res.status).toBe(401)
    expect(res.headers['WWW-Authenticate']).toContain('Basic')
  })

  it('GET returns file bytes with content-length when authed', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/book.pdf', headers: { authorization: basic('secrettoken') } }, ctx)
    expect(res.status).toBe(200)
    expect(Buffer.from(res.body as Uint8Array).toString()).toBe('PDF-DATA')
    expect(res.headers['Content-Length']).toBe('8')
  })

  it('PROPFIND Depth:1 lists files but hides excluded names', async () => {
    const res = await handleDavRequest(
      { method: 'PROPFIND', path: '/', headers: { authorization: basic('secrettoken'), depth: '1' } }, ctx)
    expect(res.status).toBe(207)
    const xml = String(res.body)
    expect(xml).toContain('book.pdf')
    expect(xml).not.toContain('db.sqlite')   // excluded
  })

  it('PUT writes a file, MKCOL makes a dir, DELETE removes', async () => {
    const auth = { authorization: basic('secrettoken') }
    const mk = await handleDavRequest({ method: 'MKCOL', path: '/sub', headers: auth }, ctx)
    expect([201, 405]).toContain(mk.status)
    const put = await handleDavRequest(
      { method: 'PUT', path: '/sub/note.md', headers: auth, body: new TextEncoder().encode('hi') }, ctx)
    expect(put.status).toBe(201)
    const get = await handleDavRequest({ method: 'GET', path: '/sub/note.md', headers: auth }, ctx)
    expect(Buffer.from(get.body as Uint8Array).toString()).toBe('hi')
    const del = await handleDavRequest({ method: 'DELETE', path: '/sub/note.md', headers: auth }, ctx)
    expect(del.status).toBe(204)
    const gone = await handleDavRequest({ method: 'GET', path: '/sub/note.md', headers: auth }, ctx)
    expect(gone.status).toBe(404)
  })

  it('blocks path traversal', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/../../etc/passwd', headers: { authorization: basic('secrettoken') } }, ctx)
    expect(res.status).toBe(403)
  })

  it('refuses GET/PUT/DELETE of .banjuan/config.json even with valid auth (identity stays local)', async () => {
    const auth = { authorization: basic('secrettoken') }
    expect((await handleDavRequest({ method: 'GET', path: '/.banjuan/config.json', headers: auth }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'PUT', path: '/.banjuan/config.json', headers: auth, body: new TextEncoder().encode('{}') }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'DELETE', path: '/.banjuan/config.json', headers: auth }, ctx)).status).toBe(403)
  })

  it('blocks paths containing a null byte (no unhandled rejection)', async () => {
    const res = await handleDavRequest(
      { method: 'GET', path: '/foo\x00bar', headers: { authorization: basic('secrettoken') } }, ctx)
    expect(res.status).toBe(403)
  })

  it('PROPFIND Depth:0 returns only the target itself', async () => {
    const res = await handleDavRequest(
      { method: 'PROPFIND', path: '/', headers: { authorization: basic('secrettoken'), depth: '0' } }, ctx)
    expect(res.status).toBe(207)
    const xml = String(res.body)
    expect(xml).not.toContain('book.pdf')   // children not listed at Depth:0
  })

  it('refuses direct access to excluded files on every verb', async () => {
    const auth = { authorization: basic('secrettoken') }
    expect((await handleDavRequest({ method: 'GET', path: '/db.sqlite', headers: auth }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'DELETE', path: '/db.sqlite', headers: auth }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'PUT', path: '/db.sqlite', headers: auth, body: new TextEncoder().encode('x') }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'PUT', path: '/plugins/evil.js', headers: auth, body: new TextEncoder().encode('x') }, ctx)).status).toBe(403)
  })

  it('refuses direct access to .banjuan/paired-devices.json (trust stays local)', async () => {
    const auth = { authorization: basic('secrettoken') }
    expect((await handleDavRequest({ method: 'GET', path: '/.banjuan/paired-devices.json', headers: auth }, ctx)).status).toBe(403)
    expect((await handleDavRequest({ method: 'PUT', path: '/.banjuan/paired-devices.json', headers: auth, body: new TextEncoder().encode('[]') }, ctx)).status).toBe(403)
  })

  it('PUT applies X-Banjuan-Mtime to the written file', async () => {
    const auth = basic('secrettoken')
    const target = 1_700_000_000_000
    const res = await handleDavRequest(
      { method: 'PUT', path: '/timed.md', headers: { authorization: auth, 'x-banjuan-mtime': String(target) }, body: new TextEncoder().encode('hi') }, ctx)
    expect(res.status).toBe(201)
    const { statSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(Math.abs(statSync(join(root, 'timed.md')).mtimeMs - target)).toBeLessThanOrEqual(1000)
  })

  it('GET /.banjuan-info returns identity without auth', async () => {
    const res = await handleDavRequest({ method: 'GET', path: '/.banjuan-info', headers: {} }, ctx)
    expect(res.status).toBe(200)
    const body = JSON.parse(String(res.body))
    expect(body.libraryId).toBe('LIB123')
    expect(body.libraryName).toBe('My Room')
    expect(body).toHaveProperty('deviceId')
    expect(body).toHaveProperty('deviceName')
  })

  it('accepts a token reported valid by ctx.isValidToken (persistent pairing)', async () => {
    const ctx2 = { ...ctx, token: 'unused', isValidToken: async (t: string) => t === 'storedtok' }
    expect((await handleDavRequest({ method: 'GET', path: '/book.pdf', headers: { authorization: basic('nope') } }, ctx2)).status).toBe(401)
    expect((await handleDavRequest({ method: 'GET', path: '/book.pdf', headers: { authorization: basic('storedtok') } }, ctx2)).status).toBe(200)
  })

  it('pairing records the peer and returns a minted token via recordPairing', async () => {
    const recorded: any[] = []
    const ctx3 = {
      ...ctx,
      deviceId: 'HOSTDEV', deviceName: 'Mac',
      recordPairing: async (peerDeviceId: string, peerDeviceName: string, peerLibraryId: string) => {
        recorded.push({ peerDeviceId, peerDeviceName, peerLibraryId })
        return 'minted-token'
      },
    }
    const res = await handleDavRequest(
      { method: 'GET', path: '/.banjuan-pair', headers: {}, query: { pin: '123456', deviceId: 'CLIENTDEV', deviceName: 'iPad', libraryId: 'CLIENTLIB' } }, ctx3)
    expect(res.status).toBe(200)
    const body = JSON.parse(String(res.body))
    expect(body.token).toBe('minted-token')
    expect(body.deviceId).toBe('HOSTDEV')
    expect(recorded[0]).toEqual({ peerDeviceId: 'CLIENTDEV', peerDeviceName: 'iPad', peerLibraryId: 'CLIENTLIB' })
  })
})
