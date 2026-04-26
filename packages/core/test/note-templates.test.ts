import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir } from './helpers.js'

describe('TemplateService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('seeds builtins on first list', async () => {
    const templates = await lib.templates.list()
    expect(templates).toHaveLength(3)
    expect(templates.every(t => t.isBuiltin)).toBe(true)
    expect(templates.map(t => t.name)).toContain('文献笔记')
    expect(templates.map(t => t.name)).toContain('Zettelkasten 卡片')
    expect(templates.map(t => t.name)).toContain('读书/会议笔记')
  })

  it('does not duplicate builtins on subsequent list calls', async () => {
    await lib.templates.list()
    const templates = await lib.templates.list()
    expect(templates.filter(t => t.isBuiltin)).toHaveLength(3)
  })

  it('creates custom template', async () => {
    const tpl = await lib.templates.create({
      name: 'My Custom',
      description: 'A custom template',
      content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]),
    })

    expect(tpl.name).toBe('My Custom')
    expect(tpl.isBuiltin).toBe(false)
    expect(tpl.description).toBe('A custom template')

    const all = await lib.templates.list()
    expect(all).toHaveLength(4)
  })

  it('updates custom template', async () => {
    const tpl = await lib.templates.create({ name: 'Draft', content: '[]' })
    const updated = await lib.templates.update(tpl.id, { name: 'Final', description: 'Updated desc' })

    expect(updated.name).toBe('Final')
    expect(updated.description).toBe('Updated desc')
    expect(updated.content).toBe('[]')
  })

  it('deletes custom template', async () => {
    const tpl = await lib.templates.create({ name: 'Temp', content: '[]' })
    await lib.templates.delete(tpl.id)

    const all = await lib.templates.list()
    expect(all.find(t => t.id === tpl.id)).toBeUndefined()
  })

  it('refuses to delete builtin template', async () => {
    const templates = await lib.templates.list()
    const builtin = templates.find(t => t.isBuiltin)!
    await expect(lib.templates.delete(builtin.id)).rejects.toThrow('Cannot delete builtin template')
  })

  it('gets template by id', async () => {
    const tpl = await lib.templates.create({ name: 'Lookup', content: '[]' })
    const found = await lib.templates.get(tpl.id)

    expect(found).not.toBeNull()
    expect(found!.name).toBe('Lookup')
  })

  it('returns null for non-existent id', async () => {
    const found = await lib.templates.get('non-existent-id')
    expect(found).toBeNull()
  })
})
