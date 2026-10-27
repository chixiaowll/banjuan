import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, unlinkSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { watchFile, stampOf, type FileWatchEvent } from './file-watch.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let closers: Array<() => void> = []
afterEach(() => { for (const c of closers) c(); closers = [] })

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'banjuan-watch-'))
  const file = join(dir, 'note.md')
  writeFileSync(file, 'one')
  const events: FileWatchEvent[] = []
  const w = watchFile(file, e => events.push(e))
  closers.push(() => w.close())
  return { dir, file, events, w }
}

describe('watchFile', () => {
  it('reports a change made by another program, with its new stamp', async () => {
    const { file, events } = setup()
    await sleep(100)
    writeFileSync(file, 'two, longer')
    await sleep(600)
    expect(events.at(-1)).toEqual({ kind: 'changed', stamp: stampOf(statSync(file)) })
  })

  it('does not report its own write', async () => {
    const { file, events, w } = setup()
    await sleep(100)
    writeFileSync(file, 'mine')
    w.markOwnWrite(stampOf(statSync(file)))
    await sleep(600)
    expect(events).toEqual([])
  })

  it('reports a deletion', async () => {
    const { file, events } = setup()
    await sleep(100)
    unlinkSync(file)
    await sleep(600)
    expect(events.at(-1)).toEqual({ kind: 'gone' })
  })

  it('reports a save that replaces the file by renaming a new one over it', async () => {
    const { dir, file, events } = setup()
    await sleep(100)
    const tmp = join(dir, '.note.md.tmp')
    writeFileSync(tmp, 'replaced by another editor')
    renameSync(tmp, file)
    await sleep(600)
    expect(events.at(-1)).toEqual({ kind: 'changed', stamp: stampOf(statSync(file)) })
  })
})
