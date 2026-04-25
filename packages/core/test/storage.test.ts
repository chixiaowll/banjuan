import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { JsonStore } from '../src/storage/json-store.js'
import { parseFrontmatter, serializeFrontmatter } from '../src/storage/frontmatter.js'

interface TestEntity {
  id: string
  name: string
}

describe('JsonStore', () => {
  let tempDir: string
  let store: JsonStore<TestEntity>

  beforeEach(() => {
    tempDir = createTempDir()
    store = new JsonStore<TestEntity>(join(tempDir, 'data'))
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  it('writes and reads a JSON file with prefix subdirectory', () => {
    const entity = { id: '9d087c54-3519-4175-950e-aa68410e05c5', name: 'test' }
    store.write(entity)

    const filePath = join(tempDir, 'data', '9d', '9d087c54-3519-4175-950e-aa68410e05c5.json')
    expect(existsSync(filePath)).toBe(true)

    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(raw.id).toBe(entity.id)
    expect(raw.name).toBe('test')

    const read = store.read('9d087c54-3519-4175-950e-aa68410e05c5')
    expect(read).toEqual(entity)
  })

  it('returns null for non-existent entity', () => {
    expect(store.read('nonexistent-id')).toBeNull()
  })

  it('deletes a JSON file', () => {
    const entity = { id: 'a4fbbc5e-1234-5678-9012-abcdef123456', name: 'deleteme' }
    store.write(entity)
    expect(store.read(entity.id)).not.toBeNull()

    const deleted = store.delete(entity.id)
    expect(deleted).toBe(true)
    expect(store.read(entity.id)).toBeNull()
  })

  it('returns false when deleting non-existent entity', () => {
    expect(store.delete('nonexistent')).toBe(false)
  })

  it('lists all entities across prefix subdirectories', () => {
    store.write({ id: '9d087c54-aaaa', name: 'first' })
    store.write({ id: 'a4fbbc5e-bbbb', name: 'second' })
    store.write({ id: '9d123456-cccc', name: 'third' })

    const all = store.listAll()
    expect(all).toHaveLength(3)
    const names = all.map(e => e.name).sort()
    expect(names).toEqual(['first', 'second', 'third'])
  })

  it('returns empty array when base directory does not exist', () => {
    const emptyStore = new JsonStore<TestEntity>(join(tempDir, 'nonexistent'))
    expect(emptyStore.listAll()).toEqual([])
  })

  it('overwrites existing entity on write', () => {
    const entity = { id: 'ab000000-1111', name: 'original' }
    store.write(entity)
    store.write({ ...entity, name: 'updated' })

    const read = store.read(entity.id)
    expect(read?.name).toBe('updated')
  })
})

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter and markdown content', () => {
    const raw = `---
id: abc123
title: My Note
tags:
  - ml
  - attention
---

# Hello

This is content.`

    const result = parseFrontmatter(raw)
    expect(result.data.id).toBe('abc123')
    expect(result.data.title).toBe('My Note')
    expect(result.data.tags).toEqual(['ml', 'attention'])
    expect(result.content).toBe('# Hello\n\nThis is content.')
  })

  it('returns empty data for content without frontmatter', () => {
    const raw = '# Just markdown\n\nNo frontmatter here.'
    const result = parseFrontmatter(raw)
    expect(result.data).toEqual({})
    expect(result.content).toBe(raw)
  })

  it('handles empty content after frontmatter', () => {
    const raw = `---
id: test
---
`
    const result = parseFrontmatter(raw)
    expect(result.data.id).toBe('test')
    expect(result.content).toBe('')
  })
})

describe('serializeFrontmatter', () => {
  it('combines YAML data and markdown content', () => {
    const data = { id: 'abc', title: 'Test', tags: ['a', 'b'] }
    const content = '# Hello\n\nWorld'
    const result = serializeFrontmatter(data, content)

    expect(result).toContain('---\n')
    expect(result).toContain('id: abc')
    expect(result).toContain('title: Test')
    expect(result).toContain('# Hello\n\nWorld')

    // Round-trip
    const parsed = parseFrontmatter(result)
    expect(parsed.data.id).toBe('abc')
    expect(parsed.data.title).toBe('Test')
    expect(parsed.content).toBe('# Hello\n\nWorld')
  })

  it('handles empty content', () => {
    const result = serializeFrontmatter({ id: 'x' }, '')
    const parsed = parseFrontmatter(result)
    expect(parsed.data.id).toBe('x')
    expect(parsed.content).toBe('')
  })
})
