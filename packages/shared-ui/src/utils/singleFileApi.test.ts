import { describe, it, expect, vi } from 'vitest'
import { createSingleFileApi } from './singleFileApi.js'
import type { BanjuanAPI, SingleFileAPI, SingleFileInfo } from '../api.js'

const info: SingleFileInfo = { path: '/Users/x/Books/深度学习.pdf', name: '深度学习.pdf', type: 'pdf', size: 1234 }

function fakeFile(viewState: Record<string, unknown> = {}) {
  let state = viewState
  return {
    info: vi.fn(async () => info),
    readBuffer: vi.fn(async () => new Uint8Array([1, 2, 3])),
    readRange: vi.fn(async (s: number, e: number) => new Uint8Array(e - s)),
    writeBytes: vi.fn(),
    getViewState: vi.fn(async () => state),
    setViewState: vi.fn(async (s: Record<string, unknown>) => { state = s }),
    openInSystem: vi.fn(async () => {}),
    libraries: vi.fn(async () => []),
    addToLibrary: vi.fn(),
    openInLibrary: vi.fn(),
    onChanged: vi.fn(() => () => {}),
  } satisfies SingleFileAPI
}

// The library API the window would otherwise reach: none of it may be called.
const base = new Proxy({}, { get: (_t, ns) => new Proxy({}, { get: (_u, m) => () => { throw new Error(`library API used: ${String(ns)}.${String(m)}`) } }) }) as unknown as BanjuanAPI

describe('createSingleFileApi', () => {
  it('describes the file as a document whose metadata is its view state', async () => {
    const file = fakeFile({ readingPosition: { page: 7 } })
    const api = createSingleFileApi(base, file, info)
    const doc = await api.documents.get('anything')
    expect(doc).toMatchObject({ title: '深度学习', type: 'pdf', path: info.path, metadata: { readingPosition: { page: 7 } } })
  })

  it('keeps metadata updates (the reading position) as the file\'s view state', async () => {
    const file = fakeFile({ zoom: 2 })
    const api = createSingleFileApi(base, file, info)
    const doc = await api.documents.get('x')
    await api.documents.update(doc!.id, { metadata: { readingPosition: { page: 3 } } })
    expect(file.setViewState).toHaveBeenCalledWith({ zoom: 2, readingPosition: { page: 3 } })
    expect((await api.documents.get(doc!.id))!.metadata).toEqual({ zoom: 2, readingPosition: { page: 3 } })
  })

  it('reads only its own file, in ranges for large ones', async () => {
    const file = fakeFile()
    const api = createSingleFileApi(base, file, info)
    expect(await api.documents.fileSize!('/elsewhere/a.pdf')).toBe(1234)
    await api.documents.readFileRange!('/elsewhere/a.pdf', 10, 20)
    expect(file.readRange).toHaveBeenCalledWith(10, 20)
    expect(new Uint8Array(await api.documents.readFileBuffer('whatever') as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(await api.documents.getFilePath('x')).toBe(info.path)
    // No URL streaming: the PDF viewer then reads in ranges.
    expect(api.documents.getFileSrc).toBeUndefined()
  })

  it('gives an HTML page a base in its own folder, so its relative CSS and images load', async () => {
    const htmlInfo: SingleFileInfo = { path: '/Users/x/网页/索引 页.html', name: '索引 页.html', type: 'html', size: 10 }
    const file = fakeFile()
    file.readBuffer.mockResolvedValue(new TextEncoder().encode('<html><head><title>t</title></head><body><img src="a.png"></body></html>'))
    const api = createSingleFileApi(base, file, htmlInfo)
    const html = await api.documents.readContent('x')
    expect(html).toContain(`<head><base href="local-file:///Users/x/${encodeURIComponent('网页')}/"><title>`)
    file.readBuffer.mockResolvedValue(new TextEncoder().encode('<p>no head</p>'))
    expect(await api.documents.readContent('x')).toMatch(/^<base href="local-file:\/\/\/Users\/x\/[^"]+\/"><p>no head<\/p>$/)
  })

  it('has no annotations, notes or tags, and refuses to create any', async () => {
    const api = createSingleFileApi(base, fakeFile(), info)
    expect(await api.annotations.list({ docId: 'x' })).toEqual([])
    expect(await api.notes.list({ docId: 'x' } as any)).toEqual([])
    expect(await api.tags.forTarget('x', 'document')).toEqual([])
    await expect(api.annotations.create({ docId: 'x' } as any)).rejects.toThrow()
    await expect(api.notes.create({ title: 't' } as any)).rejects.toThrow()
  })
})
