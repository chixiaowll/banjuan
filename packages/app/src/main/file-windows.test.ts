import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({}))
const { fileTypeOf, filesFromArgv, libraryContaining, FileWindowRegistry } = await import('./file-windows.js')

function fakeWindows() {
  let next = 1
  const closers = new Map<number, () => void>()
  const focused: number[] = []
  const hooks = {
    create: () => { const id = next++; return { win: id, id } },
    focus: (win: number) => { focused.push(win) },
    onClosed: (win: number, cb: () => void) => { closers.set(win, cb) },
  }
  return { hooks, focused, close: (win: number) => closers.get(win)?.() }
}

describe('fileTypeOf', () => {
  it('maps extensions to what the window can do with them', () => {
    expect(fileTypeOf('/a/B.PDF')).toBe('pdf')
    expect(fileTypeOf('/a/b.epub')).toBe('epub')
    expect(fileTypeOf('/a/b.md')).toBe('markdown')
    expect(fileTypeOf('/a/b.markdown')).toBe('markdown')
    expect(fileTypeOf('/a/b.txt')).toBe('text')
    expect(fileTypeOf('/a/b.jpeg')).toBe('image')
    expect(fileTypeOf('/a/b.html')).toBe('html')
    expect(fileTypeOf('/a/b.HTM')).toBe('html')
    expect(fileTypeOf('/a/b.mov')).toBe('unsupported')
    expect(fileTypeOf('/a/noext')).toBe('unsupported')
  })
})

describe('filesFromArgv', () => {
  it('takes the existing files among the arguments, skipping the program, flags and folders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'banjuan-argv-'))
    const pdf = join(dir, 'a.pdf')
    writeFileSync(pdf, 'x')
    const dev = ['/path/electron', 'dist/main/index.js', '--user-data-dir=/tmp/x', pdf, dir, join(dir, 'missing.md')]
    expect(filesFromArgv(dev, false)).toEqual([pdf])
    expect(filesFromArgv(['/Applications/App', '-psn_0_1', pdf], true)).toEqual([pdf])
  })
})

describe('libraryContaining', () => {
  it('finds the known library a file lies in, by real path', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'banjuan-lib-')))
    mkdirSync(join(base, 'lib', 'sub'), { recursive: true })
    writeFileSync(join(base, 'lib', 'sub', 'a.pdf'), 'x')
    writeFileSync(join(base, 'lib2.pdf'), 'x')
    const history = [{ path: join(base, 'lib'), name: '书房' }]
    expect(libraryContaining(join(base, 'lib', 'sub', 'a.pdf'), history)).toEqual({ root: join(base, 'lib'), name: '书房' })
    expect(libraryContaining(join(base, 'lib2.pdf'), history)).toBeUndefined()   // a prefix of the name is not "inside"
  })
})

describe('FileWindowRegistry', () => {
  it('opens one window per file — the same file again, also through a symlink, focuses it', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'banjuan-reg-')))
    const file = join(dir, 'a.pdf')
    writeFileSync(file, 'x')
    symlinkSync(file, join(dir, 'link.pdf'))
    const w = fakeWindows()
    const reg = new FileWindowRegistry(w.hooks)
    const first = reg.open(file)
    const again = reg.open(join(dir, 'link.pdf'))
    expect(again.windowId).toBe(first.windowId)
    expect(w.focused).toEqual([first.windowId])
    expect(reg.fileOf(first.windowId)?.path).toBe(file)

    w.close(first.windowId)
    expect(reg.fileOf(first.windowId)).toBeUndefined()
    expect(reg.open(file).windowId).not.toBe(first.windowId)
  })

  it('refuses folders and missing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'banjuan-reg-'))
    const reg = new FileWindowRegistry(fakeWindows().hooks)
    expect(() => reg.open(dir)).toThrow()
    expect(() => reg.open(join(dir, 'nope.pdf'))).toThrow()
  })

  it('serves an opened file, and images next to an opened markdown file — nothing else', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'banjuan-serve-')))
    mkdirSync(join(dir, 'img'))
    for (const f of ['a.md', 'img/p.png', 'secret.txt', 'b.pdf', 'other.png']) writeFileSync(join(dir, f), 'x')
    const reg = new FileWindowRegistry(fakeWindows().hooks)
    reg.open(join(dir, 'a.md'))
    expect(reg.isServable(join(dir, 'a.md'))).toBe(true)
    expect(reg.isServable(join(dir, 'img/p.png'))).toBe(true)
    expect(reg.isServable(join(dir, 'secret.txt'))).toBe(false)
    expect(reg.isServable(join(dir, 'b.pdf'))).toBe(false)
    expect(reg.isServable(join(dir, '..', 'x.png'))).toBe(false)
    expect(reg.isServable('/etc/hosts')).toBe(false)
  })

  it('serves the stylesheets, images and fonts next to an opened HTML file — not its scripts or other pages', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'banjuan-serve-html-')))
    mkdirSync(join(dir, 'assets'))
    for (const f of ['page.html', 'other.html', 'assets/site.css', 'assets/logo.svg', 'assets/font.woff2', 'assets/app.js', 'notes.txt']) writeFileSync(join(dir, f), 'x')
    const reg = new FileWindowRegistry(fakeWindows().hooks)
    reg.open(join(dir, 'page.html'))
    expect(reg.isServable(join(dir, 'assets/site.css'))).toBe(true)
    expect(reg.isServable(join(dir, 'assets/logo.svg'))).toBe(true)
    expect(reg.isServable(join(dir, 'assets/font.woff2'))).toBe(true)
    expect(reg.isServable(join(dir, 'assets/app.js'))).toBe(false)
    expect(reg.isServable(join(dir, 'other.html'))).toBe(false)
    expect(reg.isServable(join(dir, 'notes.txt'))).toBe(false)
  })
})
