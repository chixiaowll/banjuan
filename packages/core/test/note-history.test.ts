import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { NodeFS } from '@banjuan/platform-node'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { NoteHistory } from '../src/notes/history.js'

const file = (title: string, text: string) => JSON.stringify({ meta: { title }, blocks: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const DAY = 86_400_000

describe('NoteHistory', () => {
  let root: string
  let history: NoteHistory
  beforeEach(() => { root = createTempDir(); history = new NoteHistory(root, new NodeFS()) })
  afterEach(() => cleanupTempDir(root))

  it('keeps what a note was, newest first, on this device only', async () => {
    const t0 = Date.UTC(2026, 9, 28, 10, 0, 0)
    const v1 = await history.save('n-1', file('日记', '早上'), 'external', new Date(t0))
    const v2 = await history.save('n-1', file('日记', '中午'), 'edit', new Date(t0 + 60_000))
    expect(existsSync(join(root, '.banjuan', '.note-history', 'n-1'))).toBe(true)
    expect(await history.list('n-1')).toEqual([
      { version: v2, at: new Date(t0 + 60_000).toISOString(), reason: 'edit', title: '日记', preview: '中午', by: '' },
      { version: v1, at: new Date(t0).toISOString(), reason: 'external', title: '日记', preview: '早上', by: '' },
    ])
    expect(JSON.parse(await history.read('n-1', v1)).blocks[0].content[0].text).toBe('早上')
    expect(await history.newestAt('n-1')).toBe(t0 + 60_000)
    expect(await history.list('other')).toEqual([])
    expect(await history.newestAt('other')).toBeNull()
  })

  it('keeps at most 50 versions, and drops those older than 30 days but always the newest 5', async () => {
    const now = Date.UTC(2026, 9, 28)
    for (let i = 0; i < 52; i++) await history.save('many', file('x', String(i)), 'edit', new Date(now - (52 - i) * 1000))
    expect((await history.list('many')).length).toBe(50)
    for (let i = 0; i < 8; i++) await history.save('old', file('x', String(i)), 'edit', new Date(now - (40 - i) * DAY))
    await history.save('old', file('x', 'new'), 'edit', new Date(now))
    const kept = await history.list('old')
    expect(kept.length).toBe(5)
    expect(kept[0].at).toBe(new Date(now).toISOString())
  })

  it('refuses ids and versions that would reach outside its folder', async () => {
    await expect(history.save('../x', '{}', 'edit')).rejects.toThrow()
    await expect(history.read('n-1', '../../db')).rejects.toThrow()
    await expect(history.save('n-1', '{}', 'bad/reason')).rejects.toThrow()
    expect(readdirSync(join(root)).includes('x')).toBe(false)
  })
})
