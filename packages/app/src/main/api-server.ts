import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { Library } from '@banjuan/core'
import { blocksToMarkdown, markdownToBlocks } from '@banjuan/core'
import { saveClip } from './clip-service.js'
import { openLibraryForApi, initLibraryForApi, libraries, getLibraryHistory } from './ipc.js'
import { extractPdfText } from './pdf-text.js'

const MAX_TEXT_PAGES = 25

let server: ReturnType<typeof createServer> | null = null
let portFilePath = ''
let libraryGetter: () => Library | null = () => null
let activeLibraryPath: string | null = null

export function setLibraryGetter(getter: () => Library | null): void {
  libraryGetter = getter
}

export function setActiveLibrary(path: string | null): void {
  activeLibraryPath = path
}

export function getActiveLibrary(): string | null {
  return activeLibraryPath
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

function requireLib(res: ServerResponse, query: Record<string, string>): Library | null {
  const targetPath = query.library || activeLibraryPath
  if (targetPath) {
    const found = [...libraries.values()].find(l => l.rootPath === targetPath)
    if (found) return found
    json(res, 404, { error: `Library not found: ${targetPath}` })
    return null
  }
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
    const openLibraries = [...libraries.values()].map(l => l.rootPath)
    json(res, 200, {
      status: 'ok',
      libraryOpen: lib !== null,
      libraryPath: lib?.rootPath ?? null,
      libraries: openLibraries,
      activeLibrary: activeLibraryPath,
    })
    return
  }

  if (path === '/api/library/init' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      if (!body.path) { json(res, 400, { error: 'path required' }); return }
      const lib = await initLibraryForApi(body.path, body.name)
      if (!activeLibraryPath) activeLibraryPath = lib.rootPath
      const name = await lib.getName()
      json(res, 200, { status: 'ok', path: lib.rootPath, name })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/library/open' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      if (!body.path) { json(res, 400, { error: 'path required' }); return }
      const lib = await openLibraryForApi(body.path)
      if (!activeLibraryPath) activeLibraryPath = lib.rootPath
      const name = await lib.getName()
      json(res, 200, { status: 'ok', path: lib.rootPath, name })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/library/list' && req.method === 'GET') {
    const list: Array<{ path: string; name: string }> = []
    for (const lib of libraries.values()) {
      list.push({ path: lib.rootPath, name: (lib as any).name ?? lib.rootPath })
    }
    json(res, 200, list)
    return
  }

  if (path === '/api/library/history' && req.method === 'GET') {
    json(res, 200, getLibraryHistory())
    return
  }

  if (path === '/api/library/active' && req.method === 'GET') {
    json(res, 200, { path: activeLibraryPath })
    return
  }

  if (path === '/api/library/active' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      if (!body.path) { json(res, 400, { error: 'path required' }); return }
      const found = [...libraries.values()].find(l => l.rootPath === body.path)
      if (!found) { json(res, 404, { error: `Library not open: ${body.path}` }); return }
      activeLibraryPath = body.path
      json(res, 200, { status: 'ok', path: activeLibraryPath })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/library/close' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      const targetPath = body.path
      let found = false
      for (const [key, lib] of libraries.entries()) {
        if (!targetPath || lib.rootPath === targetPath) {
          await lib.close()
          libraries.delete(key)
          found = true
          if (targetPath) break
        }
      }
      json(res, 200, { status: found ? 'ok' : 'not_found' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/app/quit' && req.method === 'POST') {
    json(res, 200, { status: 'ok' })
    setTimeout(() => app.quit(), 100)
    return
  }

  if (path === '/api/clip' && req.method === 'POST') {
    const lib = requireLib(res, query)
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
    const lib = requireLib(res, query)
    if (!lib) return
    const opts: Record<string, unknown> = {}
    if (query.type) opts.type = query.type
    if (query.docId) opts.docId = query.docId
    if (query.folderId) opts.folderId = query.folderId
    if (query.folder) opts.folder = query.folder
    if (query.tag) opts.tag = query.tag
    const notes = await lib.notes.list(opts)
    json(res, 200, notes.map(n => ({ id: n.id, title: n.title, type: n.type, path: n.path, docId: n.docId, folderId: n.folderId, createdAt: n.createdAt, updatedAt: n.updatedAt })))
    return
  }

  if (path === '/api/notes/refresh' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.notes.syncDisk()
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Note Dirs (must come before noteMatch regex) ---
  if (path === '/api/notes/dirs' && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const dirs = await lib.notes.listDirs()
    json(res, 200, dirs)
    return
  }

  if (path === '/api/notes/dirs' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      await lib.notes.createDir(body.path)
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/notes/dirs/rename' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      await lib.notes.renameDir(body.oldPath, body.newPath)
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
  if (noteMatch && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const note = await lib.notes.get(noteMatch[1])
    if (!note) { json(res, 404, { error: 'Note not found' }); return }
    if (query.format === 'markdown' && note.content) {
      try {
        const blocks = JSON.parse(note.content)
        if (Array.isArray(blocks)) note.content = blocksToMarkdown(blocks)
      } catch { /* keep original */ }
    }
    json(res, 200, note)
    return
  }

  if (path === '/api/notes' && req.method === 'POST') {
    const lib = requireLib(res, query)
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
    const lib = requireLib(res, query)
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
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      if (body.content && typeof body.content === 'string') {
        body.content = JSON.stringify(markdownToBlocks(body.content))
      }
      const note = await lib.notes.update(noteMatch[1], body)
      json(res, 200, note)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (noteMatch && req.method === 'DELETE') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.notes.delete(noteMatch[1])
      json(res, 200, { status: 'deleted' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const noteMoveMatch = path.match(/^\/api\/notes\/([^/]+)\/move$/)
  if (noteMoveMatch && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      let targetFolder: string | null = null
      if (body.folder !== undefined) {
        targetFolder = body.folder
      } else if (body.folderId) {
        const folder = await lib.folders.get(body.folderId)
        if (!folder) { json(res, 404, { error: 'Folder not found' }); return }
        targetFolder = folder.name
      }
      const note = await lib.notes.move(noteMoveMatch[1], targetFolder)
      json(res, 200, note)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Documents ---
  if (path === '/api/documents/import' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const filePath: string = body.filePath
      if (!filePath) { json(res, 400, { error: 'filePath is required' }); return }
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
      const stat = await fs.stat(absPath).catch(() => null)
      if (!stat) { json(res, 404, { error: `File not found: ${absPath}` }); return }
      const destDir = body.destDir as string | undefined
      const targetDir = destDir ? join(lib.rootPath, destDir) : lib.rootPath
      await fs.mkdir(targetDir, { recursive: true })
      const fileName = path.basename(absPath)
      const destPath = join(targetDir, fileName)
      if (absPath !== destPath) {
        await fs.copyFile(absPath, destPath)
      }
      const doc = await lib.documents.import(destPath, { title: body.title, tags: body.tags })
      json(res, 200, doc)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/documents/refresh' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const result = await lib.syncWithDisk()
      json(res, 200, result)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/documents' && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const opts: Record<string, unknown> = {}
    if (query.type) opts.type = query.type
    if (query.tag) opts.tag = query.tag
    const docs = await lib.documents.list(opts)
    json(res, 200, docs)
    return
  }

  // --- Document Dirs (must come before docMatch regex) ---
  if (path === '/api/documents/dirs' && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const dirs = await lib.documents.listDirs()
    json(res, 200, dirs)
    return
  }

  if (path === '/api/documents/dirs' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      await lib.documents.createDir(body.path)
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const docTextMatch = path.match(/^\/api\/documents\/([^/]+)\/text$/)
  if (docTextMatch && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const doc = await lib.documents.get(docTextMatch[1])
      if (!doc) { json(res, 404, { error: 'Document not found' }); return }
      if (doc.type !== 'pdf') { json(res, 400, { error: `Text extraction is only supported for PDF documents (this is "${doc.type}")` }); return }
      const from = query.from ? parseInt(query.from as string, 10) : (query.page ? parseInt(query.page as string, 10) : 1)
      let to = query.to ? parseInt(query.to as string, 10) : (query.page ? parseInt(query.page as string, 10) : from)
      if (to - from + 1 > MAX_TEXT_PAGES) to = from + MAX_TEXT_PAGES - 1
      const abs = join(lib.rootPath, doc.path)
      const result = await extractPdfText(abs, from, to)
      json(res, 200, { ...result, truncated: result.to - result.from + 1 >= MAX_TEXT_PAGES && result.to < result.numPages })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const docMatch = path.match(/^\/api\/documents\/([^/]+)$/)
  if (docMatch && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const doc = await lib.documents.get(docMatch[1])
    if (!doc) { json(res, 404, { error: 'Document not found' }); return }
    json(res, 200, doc)
    return
  }

  if (docMatch && req.method === 'DELETE') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.documents.delete(docMatch[1])
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Folders ---
  if (path === '/api/folders' && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const tree = await lib.folders.getTree()
    json(res, 200, tree)
    return
  }

  if (path === '/api/folders' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const folder = await lib.folders.create(body)
      json(res, 200, folder)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const folderMatch = path.match(/^\/api\/folders\/([^/]+)$/)
  if (folderMatch && req.method === 'PUT') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const folder = await lib.folders.update(folderMatch[1], body)
      json(res, 200, folder)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (folderMatch && req.method === 'DELETE') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.folders.delete(folderMatch[1])
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Mindmaps (notes with type=mindmap) ---
  if (path === '/api/mindmaps' && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const opts: Record<string, unknown> = { type: 'mindmap' }
    if (query.docId) opts.docId = query.docId
    const maps = await lib.notes.list(opts)
    json(res, 200, maps)
    return
  }

  if (path === '/api/mindmaps' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const mm = await lib.notes.create({ ...body, type: 'mindmap' })
      json(res, 200, mm)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const mindmapMatch = path.match(/^\/api\/mindmaps\/([^/]+)$/)
  if (mindmapMatch && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const note = await lib.notes.get(mindmapMatch[1])
    if (!note) { json(res, 404, { error: 'Mindmap not found' }); return }
    const nodes = await lib.mindmaps.getNodes(note.id)
    const edges = await lib.mindmaps.getEdges(note.id)
    json(res, 200, { ...note, nodes, edges })
    return
  }

  // --- Mindmap node/edge operations ---
  const mindmapNodesMatch = path.match(/^\/api\/mindmaps\/([^/]+)\/nodes$/)
  if (mindmapNodesMatch && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const node = await lib.mindmaps.addNode(mindmapNodesMatch[1], body)
      json(res, 200, node)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const mindmapNodeMatch = path.match(/^\/api\/mindmaps\/nodes\/([^/]+)$/)
  if (mindmapNodeMatch && req.method === 'PUT') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const node = await lib.mindmaps.updateNode(mindmapNodeMatch[1], body)
      json(res, 200, node)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (mindmapNodeMatch && req.method === 'DELETE') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.mindmaps.removeNode(mindmapNodeMatch[1])
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const mindmapEdgesMatch = path.match(/^\/api\/mindmaps\/([^/]+)\/edges$/)
  if (mindmapEdgesMatch && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const edge = await lib.mindmaps.addEdge(mindmapEdgesMatch[1], body)
      json(res, 200, edge)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const mindmapEdgeMatch = path.match(/^\/api\/mindmaps\/edges\/([^/]+)$/)
  if (mindmapEdgeMatch && req.method === 'DELETE') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.mindmaps.removeEdge(mindmapEdgeMatch[1])
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const mindmapImportMatch = path.match(/^\/api\/mindmaps\/([^/]+)\/import$/)
  if (mindmapImportMatch && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const mindmapId = mindmapImportMatch[1]
      const nodeIdMap = new Map<string, string>()

      async function importNodes(nodes: any[], parentId?: string): Promise<void> {
        for (const n of nodes) {
          const node = await lib!.mindmaps.addNode(mindmapId, {
            title: n.title,
            parentId,
            content: n.content,
            color: n.color,
            shape: n.shape,
            notes: n.notes,
            hyperlink: n.hyperlink,
            imageUrl: n.imageUrl,
            styleOverrides: n.styleOverrides,
            positionX: n.positionX,
            positionY: n.positionY,
            floating: n.floating,
          })
          if (n.id) nodeIdMap.set(n.id, node.id)
          if (n.children?.length) {
            await importNodes(n.children, node.id)
          }
        }
      }

      await importNodes(body.nodes ?? [])

      for (const e of body.edges ?? []) {
        const sourceId = nodeIdMap.get(e.source) ?? e.source
        const targetId = nodeIdMap.get(e.target) ?? e.target
        await lib.mindmaps.addEdge(mindmapId, { sourceId, targetId, label: e.label })
      }

      const nodes = await lib.mindmaps.getNodes(mindmapId)
      const edges = await lib.mindmaps.getEdges(mindmapId)
      json(res, 200, { status: 'ok', nodeCount: nodes.length, edgeCount: edges.length })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Tags ---
  if (path === '/api/tags' && req.method === 'GET') {
    const lib = requireLib(res, query)
    if (!lib) return
    const tags = await lib.tags.list()
    json(res, 200, tags)
    return
  }

  if (path === '/api/tags' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      const tag = await lib.tags.create(body)
      json(res, 200, tag)
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/tags/assign' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      await lib.tags.assign(body.targetId, body.targetType, body.tags)
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  if (path === '/api/tags/unassign' && req.method === 'POST') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      const body = JSON.parse(await readBody(req))
      await lib.tags.unassign(body.targetId, body.targetType, body.tagName)
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  const tagMatch = path.match(/^\/api\/tags\/([^/]+)$/)
  if (tagMatch && req.method === 'DELETE') {
    const lib = requireLib(res, query)
    if (!lib) return
    try {
      await lib.tags.delete(tagMatch[1])
      json(res, 200, { status: 'ok' })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  // --- Annotations ---
  if (path === '/api/annotations' && req.method === 'GET') {
    const lib = requireLib(res, query)
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
    const lib = requireLib(res, query)
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
