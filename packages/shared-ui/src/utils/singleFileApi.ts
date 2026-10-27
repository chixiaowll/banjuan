import type { BanjuanAPI, SingleFileAPI, SingleFileInfo } from '../api.js'

/**
 * The API the document viewers get in a single-file window: their one file
 * presented as a document. Reads go to that file only (large ones in ranges),
 * the document's metadata is the file's view state on this device (reading
 * position), and there are no annotations, notes or tags — the viewers hide
 * those tools there (ViewerCapabilities); calls that would create any fail.
 */
export function createSingleFileApi(base: BanjuanAPI, file: SingleFileAPI, info: SingleFileInfo): BanjuanAPI {
  const docId = `file:${info.path}`
  let state: Record<string, unknown> = {}
  const loaded = file.getViewState().then(s => { state = s ?? {} }, () => {})
  const unavailable = () => Promise.reject(new Error('Not available for a file opened on its own'))
  const asArrayBuffer = (b: ArrayBuffer | Uint8Array): ArrayBuffer =>
    b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer : b

  const doc = () => ({
    id: docId,
    title: info.name.replace(/\.[^.]+$/, '') || info.name,
    authors: [] as string[],
    type: info.type as any,
    path: info.path,
    hash: '',
    metadata: { ...state },
    createdAt: '',
    updatedAt: '',
  })

  return {
    ...base,
    documents: {
      ...base.documents,
      get: async () => { await loaded; return doc() },
      update: async (_id: string, updates: { metadata?: Record<string, unknown> }) => {
        await loaded
        if (updates?.metadata) {
          state = { ...state, ...updates.metadata }
          await file.setViewState(state)
        }
        return doc()
      },
      list: async () => [],
      getFilePath: async () => info.path,
      // Not defined: with a URL the PDF viewer would download the whole file;
      // without one it reads in ranges (readFileRange).
      getFileSrc: undefined,
      readFileBuffer: async () => asArrayBuffer(await file.readBuffer()),
      readContent: async () => new TextDecoder().decode(await file.readBuffer()),
      fileSize: async () => info.size,
      readFileRange: (_path: string, start: number, end: number) => file.readRange(start, end),
      openInSystem: async () => { await file.openInSystem(); return '' },
      markRead: async () => {},
    } as BanjuanAPI['documents'],
    annotations: {
      ...base.annotations,
      list: async () => [],
      get: async () => null,
      create: unavailable,
      update: unavailable,
      delete: unavailable,
      listRecent: async () => [],
    } as BanjuanAPI['annotations'],
    notes: {
      ...base.notes,
      list: async () => [],
      get: async () => null,
      create: unavailable,
      update: unavailable,
      delete: unavailable,
    } as BanjuanAPI['notes'],
    tags: {
      ...base.tags,
      list: async () => [],
      listWithCounts: async () => [],
      forTarget: async () => [],
      namesByTarget: async () => ({}),
      create: unavailable,
      assign: unavailable,
      unassign: unavailable,
    } as BanjuanAPI['tags'],
    docLinks: {
      ...base.docLinks,
      getBacklinks: async () => [],
      getForwardLinks: async () => [],
    } as BanjuanAPI['docLinks'],
  }
}
