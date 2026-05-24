import { Library } from '@banjuan/core'
import type { PlatformDeps } from '@banjuan/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { CapacitorFS, CapacitorDatabaseFactory, WebCrypto } from '@banjuan/platform-capacitor'
import type { BanjuanAPI } from '@banjuan/shared-ui'

let library: Library | null = null

export interface LibraryEntry {
  path: string
  name: string
}

const LIBRARIES_ROOT = 'BanJuanLibrary'

export async function listLibraries(): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = []
  try {
    await Filesystem.mkdir({ path: LIBRARIES_ROOT, directory: Directory.Documents, recursive: true }).catch(() => {})
    const result = await Filesystem.readdir({ path: LIBRARIES_ROOT, directory: Directory.Documents })
    for (const item of result.files) {
      if (item.type !== 'directory') continue
      try {
        const configResult = await Filesystem.readFile({
          path: `${LIBRARIES_ROOT}/${item.name}/.banjuan/config.json`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
        const config = JSON.parse(configResult.data as string)
        entries.push({ path: `${LIBRARIES_ROOT}/${item.name}`, name: config.name || item.name })
      } catch {
        // not a library
      }
    }
  } catch {
    // root dir might not exist yet
  }
  return entries
}

export function getLibrariesRoot(): string {
  return LIBRARIES_ROOT
}

function createDeps(baseDir: string): PlatformDeps {
  const fs = new CapacitorFS(baseDir)
  return {
    fs,
    dbFactory: new CapacitorDatabaseFactory(fs),
    crypto: new WebCrypto(),
  }
}

function getLib(): Library {
  if (!library) throw new Error('Library not open')
  return library
}

export function createCapacitorAPI(): BanjuanAPI {
  return {
    library: {
      async check(path) {
        const deps = createDeps(path)
        const exists = await Library.isLibrary(path, deps)
        if (!exists) return null
        const config = await deps.fs.readTextFile(`${path}/.banjuan/config.json`)
        return JSON.parse(config)
      },
      async init(path, name) {
        library = await Library.init(path, createDeps(path), name)
      },
      async open(path) {
        library = await Library.open(path, createDeps(path))
        await library.syncWithDisk()
        try { await library.notes.syncDisk() } catch {}
        try { await library.tags.syncFromFiles() } catch {}
        const indexSvc = library.createIndexService()
        await indexSvc.rebuildFull()
      },
      async openNewWindow() {
        // Not supported on mobile
      },
      async isOpen() {
        return library !== null
      },
      async rename(name: string) {
        const lib = getLib()
        await lib.setName(name)
        return { name }
      },
    },

    dialog: {
      async openDirectory() {
        // On mobile, we use a fixed directory
        return 'BanjuanLibrary'
      },
    },

    documents: {
      async import() {
        // TODO: use Capacitor FilePicker
        return null
      },
      async list(options) {
        return getLib().documents.list(options)
      },
      async get(id) {
        return getLib().documents.get(id)
      },
      async delete(id) {
        return getLib().documents.delete(id)
      },
      async markRead(id) {
        return getLib().documents.markRead(id)
      },
      async refresh() {
        return getLib().syncWithDisk()
      },
      async createDir(dirPath) {
        return getLib().documents.createDir(dirPath)
      },
      async move(id, destDir) {
        return getLib().documents.move(id, destDir)
      },
      async listDirs() {
        return getLib().documents.listDirs()
      },
      async update(id, updates) {
        return getLib().documents.update(id, updates)
      },
      async getFilePath(relativePath) {
        return `${getLib().rootPath}/${relativePath}`
      },
      async readContent(relativePath) {
        const deps = createDeps(getLib().rootPath)
        return deps.fs.readTextFile(`${getLib().rootPath}/${relativePath}`)
      },
      async readFileBuffer(relativePath) {
        const deps = createDeps(getLib().rootPath)
        const data = await deps.fs.readFile(`${getLib().rootPath}/${relativePath}`)
        return data.buffer as ArrayBuffer
      },
      async openInSystem(_relativePath) {
        return ''
      },
    },

    tags: {
      async list() {
        return getLib().tags.list()
      },
      async listWithCounts() {
        return getLib().tags.listWithCounts()
      },
      async create(input) {
        return getLib().tags.create(input)
      },
      async forTarget(id, type) {
        return getLib().tags.forTarget(id, type)
      },
      async assign(targetId, targetType, tagNames) {
        return getLib().tags.assign(targetId, targetType, tagNames)
      },
      async unassign(targetId, targetType, tagName) {
        return getLib().tags.unassign(targetId, targetType, tagName)
      },
      async delete(tagId) {
        return getLib().tags.delete(tagId)
      },
      async rename(tagId, newName) {
        return getLib().tags.rename(tagId, newName)
      },
      async updateColor(tagId, color) {
        return getLib().tags.updateColor(tagId, color)
      },
    },

    annotations: {
      async create(input) {
        return getLib().annotations.create(input)
      },
      async list(options) {
        return getLib().annotations.list(options)
      },
      async get(id) {
        return getLib().annotations.get(id)
      },
      async update(id, updates) {
        return getLib().annotations.update(id, updates)
      },
      async delete(id) {
        return getLib().annotations.delete(id)
      },
      async listRecent(limit?: number) {
        return getLib().annotations.listRecent(limit)
      },
    },

    notes: {
      async create(input) {
        return getLib().notes.create(input)
      },
      async list(options) {
        return getLib().notes.list(options)
      },
      async get(id) {
        return getLib().notes.get(id)
      },
      async update(id, updates) {
        return getLib().notes.update(id, updates)
      },
      async delete(id) {
        return getLib().notes.delete(id)
      },
      async getAnnotations(noteId) {
        return getLib().notes.getAnnotations(noteId)
      },
      async move(id, targetFolder) {
        return getLib().notes.move(id, targetFolder)
      },
      async refresh() {
        return getLib().notes.syncDisk()
      },
      async listDirs() {
        return getLib().notes.listDirs()
      },
      async createDir(dirPath) {
        return getLib().notes.createDir(dirPath)
      },
      async renameDir(oldPath, newPath) {
        return getLib().notes.renameDir(oldPath, newPath)
      },
      onNavigateLink(callback) {
        // No-op on mobile for now; events can be wired later
        return () => {}
      },
    },

    folders: {
      async create(input) {
        return getLib().folders.create(input)
      },
      async getTree() {
        return getLib().folders.getTree()
      },
      async update(id, updates) {
        return getLib().folders.update(id, updates)
      },
      async delete(id) {
        return getLib().folders.delete(id)
      },
    },

    attachments: {
      async save(noteId, fileName, data) {
        return getLib().attachments.save(noteId, fileName, new Uint8Array(data))
      },
      async getPath(relativePath) {
        return getLib().attachments.getFullPath(relativePath)
      },
      async delete(relativePath) {
        return getLib().attachments.delete(relativePath)
      },
      async open(relativePath) {
        // TODO: use Capacitor FileOpener or share sheet
        console.warn('attachments.open not implemented on mobile')
      },
    },

    noteLinks: {
      async getBacklinks(noteId) {
        return getLib().noteLinks.getBacklinks(noteId)
      },
      async getForwardLinks(noteId) {
        return getLib().noteLinks.getForwardLinks(noteId)
      },
      async sync(noteId, links) {
        return getLib().noteLinks.sync(noteId, links)
      },
    },

    docLinks: {
      async getBacklinks(docId) {
        return getLib().docLinks.getBacklinks(docId)
      },
      async getForwardLinks(noteId) {
        return getLib().docLinks.getForwardLinks(noteId)
      },
      async sync(noteId, links) {
        return getLib().docLinks.sync(noteId, links)
      },
    },

    templates: {
      async list() {
        return getLib().templates.list()
      },
      async get(id) {
        return getLib().templates.get(id)
      },
      async create(input) {
        return getLib().templates.create(input)
      },
      async update(id, updates) {
        return getLib().templates.update(id, updates)
      },
      async delete(id) {
        return getLib().templates.delete(id)
      },
    },

    mindmaps: {
      async addNode(noteId, input) {
        return getLib().mindmaps.addNode(noteId, input)
      },
      async getNodes(noteId) {
        return getLib().mindmaps.getNodes(noteId)
      },
      async findNodesByNoteId(noteId) {
        return getLib().mindmaps.findNodesByNoteId(noteId)
      },
      async updateNode(id, updates) {
        return getLib().mindmaps.updateNode(id, updates)
      },
      async removeNode(id) {
        return getLib().mindmaps.removeNode(id)
      },
      async addEdge(noteId, input) {
        return getLib().mindmaps.addEdge(noteId, input)
      },
      async getEdges(noteId) {
        return getLib().mindmaps.getEdges(noteId)
      },
      async updateEdge(id, updates) {
        return getLib().mindmaps.updateEdge(id, updates)
      },
      async removeEdge(id) {
        return getLib().mindmaps.removeEdge(id)
      },
      async addBoundary(mindmapId, input) {
        return getLib().mindmaps.addBoundary(mindmapId, input)
      },
      async getBoundaries(mindmapId) {
        return getLib().mindmaps.getBoundaries(mindmapId)
      },
      async updateBoundary(id, updates) {
        return getLib().mindmaps.updateBoundary(id, updates)
      },
      async removeBoundary(id) {
        return getLib().mindmaps.removeBoundary(id)
      },
      async addSummary(mindmapId, input) {
        return getLib().mindmaps.addSummary(mindmapId, input)
      },
      async getSummaries(mindmapId) {
        return getLib().mindmaps.getSummaries(mindmapId)
      },
      async removeSummary(id) {
        return getLib().mindmaps.removeSummary(id)
      },
    },

    graph: {
      async getData() {
        return getLib().graph.getData()
      },
    },

    sync: {
      async getConfig() {
        return getLib().getSyncConfig()
      },
      async saveConfig(config) {
        return getLib().saveSyncConfig(config)
      },
      async testConnection(config) {
        try {
          const { CapacitorWebDAVAdapter } = await import('./capacitor-webdav-adapter')
          const adapter = new CapacitorWebDAVAdapter(createDeps(getLib().rootPath).fs)
          await adapter.connect(config)
          const files = await adapter.list(config.remotePath || '/')
          await adapter.disconnect()
          return { ok: true, message: `Connected. Found ${files.length} items on server.` }
        } catch (err: any) {
          return { ok: false, message: err?.message ?? String(err) }
        }
      },
      async run(onProgress) {
        const config = await getLib().getSyncConfig()
        if (!config) throw new Error('No sync config')
        const { SyncService } = await import('@banjuan/core')
        const { CapacitorWebDAVAdapter } = await import('./capacitor-webdav-adapter')
        const adapter = new CapacitorWebDAVAdapter(createDeps(getLib().rootPath).fs)
        await adapter.connect(config)
        const svc = new SyncService(getLib().rootPath, adapter, getLib().events, createDeps(getLib().rootPath).fs, config.remotePath)
        const result = await svc.sync(onProgress)
        onProgress?.({ phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
        try {
          const deps = createDeps(getLib().rootPath)
          const notesDir = `${getLib().rootPath}/.banjuan/notes`
          const notesExist = await deps.fs.exists(notesDir)
          console.log('[sync] notesDir:', notesDir, 'exists:', notesExist)
          if (notesExist) {
            const noteFiles = await deps.fs.readdirWithTypes(notesDir)
            console.log('[sync] note files:', noteFiles.map(f => f.name))
          }
          const indexSvc = getLib().createIndexService()
          await indexSvc.rebuildFull()
          const noteCount = await getLib().notes.list({})
          console.log('[sync] rebuild done, notes in db:', noteCount.length)
          const docCount = await getLib().documents.list({})
          console.log('[sync] docs in db:', docCount.length)
        } catch (e: any) {
          console.error('[sync] rebuild error:', e?.message, e?.stack)
        }
        return result
      },
      async stubList() {
        return []
      },
      async stubDownload() {},
      async stubUpload() {},
      async getDocStatus() {
        return 'local'
      },
    },

    search: {
      async query(query: string, options?: { type?: string; limit?: number }) {
        return getLib().search.query(query, options)
      },
    },

    index: {
      async rebuild() {
        const indexSvc = getLib().createIndexService()
        await indexSvc.rebuildFull()
      },
    },
  }
}
