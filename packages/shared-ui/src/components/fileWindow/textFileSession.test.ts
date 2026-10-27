import { describe, it, expect, vi, afterEach } from 'vitest'
import { decodeTextFile, encodeTextFile, TextFileSession, type SessionStatus } from './textFileSession.js'

const bytes = (s: string) => new TextEncoder().encode(s)
const BOM = [0xef, 0xbb, 0xbf]

describe('decodeTextFile / encodeTextFile', () => {
  it('gives back exactly the same bytes for LF, CRLF and BOM files', () => {
    for (const raw of [bytes('# 标题\n\n- a\n- b\n'), bytes('line1\r\nline2\r\n'), new Uint8Array([...BOM, ...bytes('有 BOM\r\n')])]) {
      const d = decodeTextFile(raw)
      expect(d.readOnlyReason).toBeUndefined()
      expect([...encodeTextFile(d.text, d)]).toEqual([...raw])
    }
  })

  it('hands the editor LF text and remembers the file\'s line ending', () => {
    const d = decodeTextFile(bytes('a\r\nb\r\n'))
    expect(d).toMatchObject({ text: 'a\nb\n', eol: '\r\n', bom: false })
    expect(new TextDecoder().decode(encodeTextFile('a\nb\nc', d))).toBe('a\r\nb\r\nc')
  })

  it('evens mixed line endings out to the more common one', () => {
    expect(decodeTextFile(bytes('a\r\nb\r\nc\n')).eol).toBe('\r\n')
    expect(decodeTextFile(bytes('a\nb\nc\r\n')).eol).toBe('\n')
  })

  it('opens text that isn\'t UTF-8 read-only', () => {
    const gbk = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3])   // 你好 in GBK
    expect(decodeTextFile(gbk).readOnlyReason).toBe('encoding')
  })
})

describe('TextFileSession', () => {
  afterEach(() => { vi.useRealTimers() })

  function session(text = 'hello\n') {
    vi.useFakeTimers()
    const writes: string[] = []
    let failNext: Error | null = null
    let stamp = 0
    const statuses: SessionStatus[] = []
    let reloaded: string | null = null
    const s = new TextFileSession({
      decoded: decodeTextFile(bytes(text)),
      write: async (b) => {
        if (failNext) { const e = failNext; failNext = null; throw e }
        writes.push(new TextDecoder().decode(b))
        return { stamp: `s${++stamp}` }
      },
      onStatus: (st) => statuses.push(st),
      onReload: (t) => { reloaded = t },
      delay: 1000,
    })
    return { s, writes, statuses, failWith: (e: Error) => { failNext = e }, reloaded: () => reloaded }
  }

  it('saves a second after the last edit, once', async () => {
    const { s, writes } = session()
    s.setText('hello w\n')
    await vi.advanceTimersByTimeAsync(500)
    s.setText('hello world\n')
    await vi.advanceTimersByTimeAsync(999)
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(writes).toEqual(['hello world\n'])
    expect(s.status).toBe('saved')
  })

  it('an edit made while saving is saved after it', async () => {
    const { s, writes } = session()
    s.setText('one\n')
    const saving = s.save()
    s.setText('two\n')
    await saving
    expect(s.status).toBe('dirty')
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toEqual(['one\n', 'two\n'])
    expect(s.status).toBe('saved')
  })

  it('a change made elsewhere reloads when nothing is unsaved, and asks when something is', async () => {
    const { s, reloaded } = session()
    await s.external({ kind: 'changed', stamp: 'x1' }, async () => bytes('from outside\n'))
    expect(reloaded()).toBe('from outside\n')
    expect(s.status).toBe('saved')

    s.setText('mine\n')
    await s.external({ kind: 'changed', stamp: 'x2' }, async () => bytes('outside again\n'))
    expect(s.status).toBe('conflict')
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.status).toBe('conflict')   // no autosave over the other change
  })

  it('a conflict resolves either way', async () => {
    const { s, writes, reloaded } = session()
    s.setText('mine\n')
    await s.external({ kind: 'changed', stamp: 'x' }, async () => bytes('theirs\n'))
    await s.resolveConflict('mine')
    expect(writes.at(-1)).toBe('mine\n')
    expect(s.status).toBe('saved')

    s.setText('mine 2\n')
    await s.external({ kind: 'changed', stamp: 'y' }, async () => bytes('theirs 2\n'))
    await s.resolveConflict('theirs')
    expect(reloaded()).toBe('theirs 2\n')
    expect(s.status).toBe('saved')
  })

  it('ignores the change event of its own save', async () => {
    const { s, reloaded } = session()
    s.setText('saved by me\n')
    await s.save()
    await s.external({ kind: 'changed', stamp: 's1' }, async () => bytes('should not load\n'))
    expect(reloaded()).toBeNull()
  })

  it('stops saving once the file is gone', async () => {
    const { s, writes } = session()
    await s.external({ kind: 'gone' }, async () => new Uint8Array())
    s.setText('edit\n')
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toEqual([])
    expect(s.status).toBe('gone')
  })

  it('a failed save leaves the text unsaved and tries again on ⌘S', async () => {
    const { s, writes, failWith } = session()
    failWith(new Error('disk full'))
    s.setText('x\n')
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.status).toBe('error')
    await s.save()
    expect(writes).toEqual(['x\n'])
    expect(s.status).toBe('saved')
  })

  it('a read-only (non-UTF-8) file is never written', async () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const s = new TextFileSession({ decoded: decodeTextFile(new Uint8Array([0xc4, 0xe3])), write, onStatus: () => {}, onReload: () => {} })
    s.setText('edited')
    await s.save()
    expect(write).not.toHaveBeenCalled()
    expect(s.status).toBe('readonly')
  })
})

