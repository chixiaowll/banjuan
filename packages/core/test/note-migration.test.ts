import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { serializeFrontmatter } from '../src/storage/frontmatter.js'
import { migrateNotesToJson } from '../src/notes/migration.js'

describe('migrateNotesToJson', () => {
  let tempDir: string
  let notesDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    notesDir = join(tempDir, 'notes')
    mkdirSync(notesDir, { recursive: true })
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  it('migrates .md files to .json and creates backup', () => {
    const md = serializeFrontmatter(
      {
        id: 'note-1',
        title: 'My Note',
        docId: 'doc-abc',
        folderId: null,
        annotationIds: ['ann-1'],
        tags: ['test'],
        contentFormat: 'markdown',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      '# Hello\n\nSome paragraph\n\n- item one\n- item two\n\n1. first\n2. second\n\n> a quote',
    )
    writeFileSync(join(notesDir, 'note-1.md'), md)

    const result = migrateNotesToJson(notesDir)

    expect(result.migrated).toBe(1)
    expect(result.errors).toEqual([])

    // .json created
    const jsonPath = join(notesDir, 'note-1.json')
    expect(existsSync(jsonPath)).toBe(true)

    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(parsed.meta.id).toBe('note-1')
    expect(parsed.meta.title).toBe('My Note')
    expect(parsed.meta.docId).toBe('doc-abc')
    expect(parsed.meta.contentFormat).toBe('json')
    expect(parsed.meta.tags).toEqual(['test'])
    expect(parsed.meta.annotationIds).toEqual(['ann-1'])

    // blocks converted
    expect(parsed.blocks.length).toBeGreaterThan(0)
    expect(parsed.blocks[0]).toEqual({
      type: 'heading',
      props: { level: 1 },
      content: [{ type: 'text', text: 'Hello' }],
    })

    // bullet list items
    const bullets = parsed.blocks.filter((b: any) => b.type === 'bulletListItem')
    expect(bullets).toHaveLength(2)

    // numbered list items
    const numbered = parsed.blocks.filter((b: any) => b.type === 'numberedListItem')
    expect(numbered).toHaveLength(2)

    // quote → paragraph with italic
    const quote = parsed.blocks.find(
      (b: any) => b.type === 'paragraph' && b.content[0]?.styles?.italic,
    )
    expect(quote).toBeTruthy()
    expect(quote.content[0].text).toBe('a quote')

    // backup exists
    expect(existsSync(join(notesDir, 'backup', 'note-1.md'))).toBe(true)
    // original removed
    expect(existsSync(join(notesDir, 'note-1.md'))).toBe(false)
  })

  it('skips files that already have a .json counterpart', () => {
    const md = serializeFrontmatter(
      { id: 'note-2', title: 'Existing' },
      'Some content',
    )
    writeFileSync(join(notesDir, 'note-2.md'), md)
    writeFileSync(join(notesDir, 'note-2.json'), '{}')

    const result = migrateNotesToJson(notesDir)

    expect(result.migrated).toBe(0)
    expect(result.errors).toEqual([])
    // .md not moved
    expect(existsSync(join(notesDir, 'note-2.md'))).toBe(true)
  })

  it('returns empty result for non-existent directory', () => {
    const result = migrateNotesToJson(join(tempDir, 'nonexistent'))
    expect(result.migrated).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('handles multiple files and reports errors', () => {
    const md1 = serializeFrontmatter({ id: 'a', title: 'A' }, 'content A')
    const md2 = serializeFrontmatter({ id: 'b', title: 'B' }, '## Sub heading\n\ntext')
    writeFileSync(join(notesDir, 'a.md'), md1)
    writeFileSync(join(notesDir, 'b.md'), md2)

    const result = migrateNotesToJson(notesDir)

    expect(result.migrated).toBe(2)
    expect(result.errors).toEqual([])
    expect(existsSync(join(notesDir, 'a.json'))).toBe(true)
    expect(existsSync(join(notesDir, 'b.json'))).toBe(true)

    const parsed = JSON.parse(readFileSync(join(notesDir, 'b.json'), 'utf-8'))
    expect(parsed.blocks[0]).toEqual({
      type: 'heading',
      props: { level: 2 },
      content: [{ type: 'text', text: 'Sub heading' }],
    })
  })
})
