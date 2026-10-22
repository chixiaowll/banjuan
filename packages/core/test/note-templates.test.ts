import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'

describe('TemplateService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
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

  it('stores custom templates as library files, so they survive a DB rebuild and sync', async () => {
    const tpl = await lib.templates.create({ name: '周报', content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '本周进展' }] }]) })
    const file = join(libPath, '.banjuan', 'templates', `${tpl.id}.json`)
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf-8')).name).toBe('周报')

    const db = (lib as any).db
    db.run('DELETE FROM note_templates')
    const again = await lib.templates.list()
    expect(again.filter(t => !t.isBuiltin).map(t => t.name)).toEqual(['周报'])

    await lib.templates.update(tpl.id, { name: '周报（新）' })
    expect(JSON.parse(readFileSync(file, 'utf-8')).name).toBe('周报（新）')
    const note = await lib.notes.create({ title: '第 1 周', templateId: tpl.id })
    expect(JSON.parse(note.content)[0].content[0].text).toBe('本周进展')
    await lib.templates.delete(tpl.id)
    expect(existsSync(file)).toBe(false)
  })

  it('moves custom templates that only existed in the DB into files, once', async () => {
    const db = (lib as any).db
    const now = new Date().toISOString()
    db.run("INSERT INTO note_templates (id, name, description, content, is_builtin, sort_order, created_at, updated_at) VALUES ('old-1', '旧模板', '', '[]', 0, 9, ?, ?)", [now, now])
    const first = await lib.templates.list()
    expect(first.filter(t => t.name === '旧模板')).toHaveLength(1)
    expect(existsSync(join(libPath, '.banjuan', 'templates', 'old-1.json'))).toBe(true)
    const second = await lib.templates.list()
    expect(second.filter(t => t.name === '旧模板')).toHaveLength(1)
  })
})
