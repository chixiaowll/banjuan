import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findSameContent } from './same-content.js'

describe('findSameContent', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'banjuan-same-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('finds a file with the same bytes under another name, not one of the same size with other bytes', async () => {
    const put = (name: string, data: string) => { writeFileSync(join(dir, name), data); return join(dir, name) }
    const src = put('报告.pdf', 'same bytes here')
    const other = put('a.pdf', 'SAME BYTES HERE')   // same size, different bytes
    const copy = put('报告 (1).pdf', 'same bytes here')
    expect(await findSameContent(src, [join(dir, 'missing.pdf'), other, copy])).toBe(2)
    expect(await findSameContent(src, [other])).toBe(-1)
    expect(await findSameContent(src, [])).toBe(-1)
  })
})
