import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { writeZip } from './zip.js'

describe('writeZip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-test-'))

  it('writes nested entries with their content, no temp files or shell', () => {
    const out = join(dir, 'a.zip')
    writeZip(out, {
      '笔记/笔记.md': '# 标题\n正文',
      '笔记/attachments/图.png': new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    })
    const files = unzipSync(readFileSync(out))
    expect(Object.keys(files).sort()).toEqual(['笔记/attachments/图.png', '笔记/笔记.md'])
    expect(strFromU8(files['笔记/笔记.md'])).toBe('# 标题\n正文')
    expect(Array.from(files['笔记/attachments/图.png'])).toEqual([137, 80, 78, 71, 1, 2, 3])
  })

  it('treats shell metacharacters in names as plain file names', () => {
    const out = join(dir, 'b.zip')
    const marker = join(dir, 'pwned')
    const evil = `$(touch ${marker}) \`touch ${marker}\``
    writeZip(out, { [`${evil}/${evil}.md`]: 'x' })
    expect(existsSync(marker)).toBe(false)
    expect(Object.keys(unzipSync(readFileSync(out)))).toEqual([`${evil}/${evil}.md`])
  })
})
