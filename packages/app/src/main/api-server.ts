import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Library } from '@banjuan/core'
import { saveClip } from './clip-service.js'

let server: ReturnType<typeof createServer> | null = null
let portFilePath = ''
let libraryGetter: () => Library | null = () => null

export function setLibraryGetter(getter: () => Library | null): void {
  libraryGetter = getter
}

function requestRendererScreenshot(noteId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { resolve(null); return }
    const requestId = randomUUID()
    const timeout = setTimeout(() => { ipcMain.removeHandler(`note-render-reply:${requestId}`); resolve(null) }, 10000)
    ipcMain.handleOnce(`note-render-reply:${requestId}`, (_event, dataUrl: string | null) => {
      clearTimeout(timeout)
      return dataUrl
    })
    win.webContents.send('note-render-request', { noteId, requestId })
    ipcMain.once(`note-render-result:${requestId}`, (_event, dataUrl: string | null) => {
      clearTimeout(timeout)
      resolve(dataUrl)
    })
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function parseUrl(raw: string): { path: string; query: Record<string, string> } {
  const [path, qs] = raw.split('?', 2)
  const query: Record<string, string> = {}
  if (qs) {
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=', 2)
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
    }
  }
  return { path, query }
}

function requireLib(res: ServerResponse): ReturnType<typeof libraryGetter> {
  const lib = libraryGetter()
  if (!lib) { json(res, 503, { error: 'Library not open' }); return null }
  return lib
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    json(res, 204, null)
    return
  }

  const { path, query } = parseUrl(req.url ?? '')

  if (path === '/api/status' && req.method === 'GET') {
    const lib = libraryGetter()
    json(res, 200, {
      status: 'ok',
      libraryOpen: lib !== null,
      libraryPath: lib?.rootPath ?? null,
    })
    return
  }

  if (path === '/api/clip' && req.method === 'POST') {
    const lib = requireLib(res)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const result = await saveClip(lib, body)
      json(res, 200, { status: 'ok', ...result })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Notes ---
  if (path === '/api/notes' && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    const opts: Record<string, unknown> = {}
    if (query.type) opts.type = query.type
    if (query.docId) opts.docId = query.docId
    if (query.folderId) opts.folderId = query.folderId
    if (query.tag) opts.tag = query.tag
    const notes = await lib.notes.list(opts)
    json(res, 200, notes.map(n => ({ id: n.id, title: n.title, type: n.type, docId: n.docId, folderId: n.folderId, createdAt: n.createdAt, updatedAt: n.updatedAt })))
    return
  }

  const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
  if (noteMatch && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    const note = await lib.notes.get(noteMatch[1])
    if (!note) { json(res, 404, { error: 'Note not found' }); return }
    json(res, 200, note)
    return
  }

  if (path === '/api/notes' && req.method === 'POST') {
    const lib = requireLib(res)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const note = await lib.notes.create(body)
      json(res, 200, note)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const noteRenderMatch = path.match(/^\/api\/notes\/([^/]+)\/render$/)
  if (noteRenderMatch && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    const note = await lib.notes.get(noteRenderMatch[1])
    if (!note) { json(res, 404, { error: 'Note not found' }); return }
    try {
      const dataUrl = await requestRendererScreenshot(note.id)
      if (!dataUrl) { json(res, 500, { error: 'Render failed or timed out' }); return }
      json(res, 200, { dataUrl })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (noteMatch && req.method === 'PUT') {
    const lib = requireLib(res)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const note = await lib.notes.update(noteMatch[1], body)
      json(res, 200, note)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Documents ---
  if (path === '/api/documents' && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    const opts: Record<string, unknown> = {}
    if (query.type) opts.type = query.type
    if (query.tag) opts.tag = query.tag
    const docs = await lib.documents.list(opts)
    json(res, 200, docs)
    return
  }

  const docMatch = path.match(/^\/api\/documents\/([^/]+)$/)
  if (docMatch && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    const doc = await lib.documents.get(docMatch[1])
    if (!doc) { json(res, 404, { error: 'Document not found' }); return }
    json(res, 200, doc)
    return
  }

  // --- Annotations ---
  if (path === '/api/annotations' && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    if (!query.docId) { json(res, 400, { error: 'docId required' }); return }
    const opts: Record<string, unknown> = { docId: query.docId }
    if (query.page) opts.page = parseInt(query.page, 10)
    const annotations = await lib.annotations.list(opts as any)
    json(res, 200, annotations)
    return
  }

  // --- Search ---
  if (path === '/api/search' && req.method === 'GET') {
    const lib = requireLib(res)
    if (!lib) return
    if (!query.q) { json(res, 400, { error: 'q (query) required' }); return }
    const opts: Record<string, unknown> = {}
    if (query.type) opts.type = query.type
    if (query.limit) opts.limit = parseInt(query.limit, 10)
    const results = await lib.search.query(query.q, opts)
    json(res, 200, results)
    return
  }

  json(res, 404, { error: 'Not found' })
}

export function startApiServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch(() => {
        json(res, 500, { error: 'Internal error' })
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start API server'))
        return
      }
      const port = addr.port

      const banjuanDir = join(homedir(), '.banjuan')
      mkdirSync(banjuanDir, { recursive: true })
      portFilePath = join(banjuanDir, 'api-port')
      writeFileSync(portFilePath, String(port), 'utf-8')

      console.log(`API server listening on http://127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', reject)
  })
}

export function stopApiServer(): void {
  if (server) {
    server.close()
    server = null
  }
  if (portFilePath && existsSync(portFilePath)) {
    unlinkSync(portFilePath)
  }
}
