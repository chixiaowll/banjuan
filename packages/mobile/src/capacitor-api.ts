import { Library } from '@banjuan/core'
import type { PlatformDeps } from '@banjuan/core'
import { CapacitorFS, CapacitorDatabaseFactory, WebCrypto } from '@banjuan/platform-capacitor'
import type { BanjuanAPI } from '@banjuan/shared-ui'

let library: Library | null = null

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
        const lib = await Library.open(path, deps)
        const config = await lib.getConfig()
        await lib.close()
        return config
      },
      async init(path, name) {
        library = await Library.init(path, createDeps(path), name)
      },
      async open(path) {
        library = await Library.open(path, createDeps(path))
      },
      async openNewWindow() {
        // Not supported on mobile
      },
      async isOpen() {
        return library !== null
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
      async run() {
        const svc = getLib().createSyncService()
        const config = await getLib().getSyncConfig()
        if (!config) throw new Error('No sync config')
        await svc.sync()
        const indexSvc = getLib().createIndexService()
        await indexSvc.rebuildFull()
      },
      async stubList() {
        const stubSvc = getLib().createStubService()
        return stubSvc.listStubs()
      },
      async stubDownload(docId) {
        const stubSvc = getLib().createStubService()
        const stub = await stubSvc.getStub(docId)
        if (!stub) throw new Error(`No stub for document: ${docId}`)
        const localPath = `${getLib().rootPath}/${stub.relativePath}`
        await stubSvc.downloadFile(docId, localPath)
      },
      async stubUpload(docId) {
        const doc = await getLib().documents.get(docId)
        if (!doc) throw new Error(`Document not found: ${docId}`)
        const stubSvc = getLib().createStubService()
        const localPath = `${getLib().rootPath}/${doc.relativePath}`
        await stubSvc.uploadFile(localPath, doc.relativePath)
      },
      async getDocStatus(docId) {
        const doc = await getLib().documents.get(docId)
        if (!doc) return 'local'
        const stubSvc = getLib().createStubService()
        const localPath = `${getLib().rootPath}/${doc.relativePath}`
        return stubSvc.getStatus(docId, localPath)
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
