import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { importDocumentFiles } from './document-import.js'

// A stand-in library: the import only needs its root and two document calls.
function fakeLibrary(rootPath: string, alreadyImported: string[] = []) {
  const known = new Set(alreadyImported)
  const imported: string[] = []
  return {
    rootPath,
    imported,
    documents: {
      listImportedPaths: async () => new Set(known),
      importMany: async (paths: string[]) => paths.map(p => {
        const rel = relative(realpathSync(rootPath), realpathSync(p))
        if (known.has(rel)) return { path: p, error: 'File already imported' }
        known.add(rel)
        imported.push(rel)
        return { path: p, doc: { id: rel } as any }
      }),
    },
  }
}

const tree = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') ? [] :
    e.isDirectory() ? tree(join(dir, e.name)).map(p => `${e.name}/${p}`) : [e.name]).sort()

describe('importDocumentFiles', () => {
  let base: string
  let root: string
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'banjuan-import-'))
    root = join(base, 'lib')
    mkdirSync(join(root, '.banjuan'), { recursive: true })
  })

  it('copies files and folders from outside into the library', async () => {
    mkdirSync(join(base, 'src/sub'), { recursive: true })
    writeFileSync(join(base, 'src/a.pdf'), 'A')
    writeFileSync(join(base, 'src/sub/b.pdf'), 'B')
    writeFileSync(join(base, 'c.pdf'), 'C')
    const lib = fakeLibrary(root)
    const results = await importDocumentFiles(lib as any, [join(base, 'src'), join(base, 'c.pdf')], null)
    expect(results.every(r => r.success)).toBe(true)
    expect(tree(root)).toEqual(['c.pdf', 'src/a.pdf', 'src/sub/b.pdf'])
  })

  it('a folder already in the library is imported where it is, not copied into itself', async () => {
    mkdirSync(join(root, 'papers'), { recursive: true })
    writeFileSync(join(root, 'papers/a.pdf'), 'A')
    writeFileSync(join(root, 'papers/b.pdf'), 'B')
    const lib = fakeLibrary(root, ['papers/a.pdf'])
    const results = await importDocumentFiles(lib as any, [join(root, 'papers')], 'papers')
    expect(tree(root)).toEqual(['papers/a.pdf', 'papers/b.pdf'])
    expect(lib.imported).toEqual(['papers/b.pdf'])
    expect(results).toContainEqual({ title: 'a.pdf', success: false, error: 'ALREADY_IN_LIBRARY' })
  })

  it('dropping the library folder itself finds its new files and copies nothing', async () => {
    writeFileSync(join(root, 'x.pdf'), 'X')
    writeFileSync(join(root, '.banjuan/db.sqlite'), '')
    const lib = fakeLibrary(root)
    await importDocumentFiles(lib as any, [root], null)
    expect(tree(root)).toEqual(['x.pdf'])
    expect(lib.imported).toEqual(['x.pdf'])
  })

  it('a dropped folder that contains the library skips the library', async () => {
    writeFileSync(join(root, 'inside.pdf'), 'I')
    writeFileSync(join(base, 'outside.pdf'), 'O')
    const lib = fakeLibrary(root, ['inside.pdf'])
    const results = await importDocumentFiles(lib as any, [base], 'imported')
    const copied = tree(join(root, 'imported'))
    expect(copied.some(p => p.endsWith('outside.pdf'))).toBe(true)
    expect(copied.some(p => p.includes('inside.pdf'))).toBe(false)
    expect(results.filter(r => !r.success)).toEqual([])
    expect(existsSync(join(root, 'imported', base.split('/').pop()!, 'lib'))).toBe(false)
  })

  it('keeps both files when a name is taken', async () => {
    writeFileSync(join(base, 'a.pdf'), 'NEW')
    writeFileSync(join(root, 'a.pdf'), 'OLD')
    const lib = fakeLibrary(root, ['a.pdf'])
    await importDocumentFiles(lib as any, [join(base, 'a.pdf')], null)
    expect(tree(root)).toEqual(['a (2).pdf', 'a.pdf'])
  })
})
