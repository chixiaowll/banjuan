import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileViewStateStore } from './file-view-state.js'

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'banjuan-viewstate-')), 'file-view-state.json')

describe('FileViewStateStore', () => {
  it('keeps each file\'s state and survives a reload', async () => {
    const file = tempFile()
    const a = new FileViewStateStore(file)
    a.set('/x/a.pdf', { readingPosition: { page: 3 } })
    await a.flush()
    const b = new FileViewStateStore(file)
    expect(b.get('/x/a.pdf')).toEqual({ readingPosition: { page: 3 } })
    expect(b.get('/x/none.pdf')).toEqual({})
  })

  it('keeps only the most recent files, a file used again counting as recent', async () => {
    const file = tempFile()
    const s = new FileViewStateStore(file, 3)
    s.set('/a', { n: 1 })
    s.set('/b', { n: 2 })
    s.set('/c', { n: 3 })
    s.set('/a', { n: 4 })      // used again: now the newest
    s.set('/d', { n: 5 })      // pushes out the oldest, /b
    await s.flush()
    const reloaded = new FileViewStateStore(file, 3)
    expect(reloaded.get('/b')).toEqual({})
    expect(reloaded.get('/a')).toEqual({ n: 4 })
    expect(reloaded.get('/c')).toEqual({ n: 3 })
    expect(reloaded.get('/d')).toEqual({ n: 5 })
  })

  it('a damaged file reads as empty and is replaced on the next write', async () => {
    const file = tempFile()
    writeFileSync(file, '{ not json')
    const s = new FileViewStateStore(file)
    expect(s.get('/a')).toEqual({})
    s.set('/a', { ok: true })
    await s.flush()
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ '/a': { ok: true } })
  })
})
