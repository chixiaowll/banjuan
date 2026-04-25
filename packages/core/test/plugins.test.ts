import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

const DIST_PATH = join(import.meta.dirname, '..', 'dist', 'index.js')

describe('EventBus', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('emits document:imported events', async () => {
    let received: any = null
    lib.events.on('document:imported', (data) => { received = data })
    const testFile = join(tempDir, 'test.txt')
    writeFileSync(testFile, 'Hello')
    const doc = await lib.documents.import(testFile)
    expect(received).not.toBeNull()
    expect(received.document.id).toBe(doc.id)
  })

  it('emits document:deleted events', async () => {
    let received: any = null
    lib.events.on('document:deleted', (data) => { received = data })
    const testFile = join(tempDir, 'test.txt')
    writeFileSync(testFile, 'Hello')
    const doc = await lib.documents.import(testFile)
    await lib.documents.delete(doc.id)
    expect(received).not.toBeNull()
    expect(received.id).toBe(doc.id)
  })

  it('emits annotation:created events', async () => {
    let received: any = null
    lib.events.on('annotation:created', (data) => { received = data })
    const testFile = join(tempDir, 'test.txt')
    writeFileSync(testFile, 'Hello')
    const doc = await lib.documents.import(testFile)
    const ann = await lib.annotations.create({
      docId: doc.id,
      type: 'highlight',
      position: { type: 'text', startOffset: 0, endOffset: 5, text: 'Hello' },
    })
    expect(received).not.toBeNull()
    expect(received.annotation.id).toBe(ann.id)
  })

  it('emits note:created events', async () => {
    let received: any = null
    lib.events.on('note:created', (data) => { received = data })
    const note = await lib.notes.create({ title: 'Test Note' })
    expect(received).not.toBeNull()
    expect(received.note.id).toBe(note.id)
  })

  it('emits mindmap:created events', async () => {
    let received: any = null
    lib.events.on('mindmap:created', (data) => { received = data })
    const mm = await lib.mindmaps.create({ title: 'Test Map' })
    expect(received).not.toBeNull()
    expect(received.mindmap.id).toBe(mm.id)
  })

  it('removes listener with off()', () => {
    const calls: string[] = []
    const handler = () => { calls.push('called') }
    lib.events.on('note:created', handler)
    lib.events.off('note:created', handler)
    lib.events.emit('note:created', { note: {} as any })
    expect(calls).toHaveLength(0)
  })

  it('removeAllListeners clears everything', () => {
    const calls: string[] = []
    lib.events.on('note:created', () => { calls.push('a') })
    lib.events.on('note:deleted', () => { calls.push('b') })
    lib.events.removeAllListeners()
    lib.events.emit('note:created', { note: {} as any })
    lib.events.emit('note:deleted', { id: 'x' })
    expect(calls).toHaveLength(0)
  })
})

describe('PluginManager', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('lists no plugins initially', () => {
    expect(lib.plugins.list()).toEqual([])
  })

  it('loads a plugin and lists it', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'test-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      export default class TestPlugin extends BanjuanPlugin {
        async onload() {
          this.addCommand({ id: 'hello', name: 'Say Hello', callback: async () => {} })
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    const plugins = lib.plugins.list()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('test-plugin')
    expect(plugins[0].name).toBe('Test Plugin')
    expect(plugins[0].version).toBe('1.0.0')
    expect(plugins[0].enabled).toBe(true)
  })

  it('gets plugin commands', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'cmd-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'cmd-plugin', name: 'Cmd', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      export default class CmdPlugin extends BanjuanPlugin {
        async onload() {
          this.addCommand({ id: 'test', name: 'Test Cmd', callback: async () => {} })
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    const cmds = lib.plugins.getCommands()
    expect(cmds).toHaveLength(1)
    expect(cmds[0].id).toBe('cmd-plugin:test')
    expect(cmds[0].name).toBe('Test Cmd')
    expect(cmds[0].pluginId).toBe('cmd-plugin')
  })

  it('runs a plugin command', async () => {
    const marker = join(tempDir, 'cmd-ran.txt')
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'run-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'run-plugin', name: 'Run', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      import { writeFileSync } from 'node:fs'
      export default class RunPlugin extends BanjuanPlugin {
        async onload() {
          const marker = '${marker}'
          this.addCommand({ id: 'go', name: 'Go', callback: async () => {
            writeFileSync(marker, 'done')
          }})
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    await lib.plugins.runCommand('run-plugin:go')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(marker, 'utf-8')).toBe('done')
  })

  it('unloads a plugin', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'unload-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'unload-plugin', name: 'Unload', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      export default class UnloadPlugin extends BanjuanPlugin {
        async onload() {}
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    expect(lib.plugins.list()).toHaveLength(1)
    await lib.plugins.unload('unload-plugin')
    expect(lib.plugins.list()).toHaveLength(0)
  })

  it('plugin can listen to events via on()', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'event-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'event-plugin', name: 'EventPlugin', version: '1.0.0', apiVersion: '1',
    }))
    // Plugin stores received events in a global so we can inspect
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      export const received = []
      export default class EventPlugin extends BanjuanPlugin {
        async onload() {
          this.on('note:created', (data) => { received.push(data) })
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    await lib.notes.create({ title: 'Trigger Event' })

    // import the plugin module to check received events
    const mod = await import(`file://${join(pluginDir, 'index.js')}`)
    expect(mod.received).toHaveLength(1)
    expect(mod.received[0].note.title).toBe('Trigger Event')
  })

  it('unloading cleans up event listeners', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'cleanup-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'cleanup-plugin', name: 'Cleanup', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      export const received = []
      export default class CleanupPlugin extends BanjuanPlugin {
        async onload() {
          this.on('note:created', (data) => { received.push(data) })
        }
        async onunload() {}
      }
    `)

    await lib.plugins.loadAll()
    await lib.plugins.unload('cleanup-plugin')
    await lib.notes.create({ title: 'After Unload' })

    const mod = await import(`file://${join(pluginDir, 'index.js')}`)
    expect(mod.received).toHaveLength(0)
  })

  it('throws on runCommand with unknown id', async () => {
    await expect(lib.plugins.runCommand('nonexistent')).rejects.toThrow('Command not found')
  })

  it('throws when loading plugin without manifest', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'bad-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default class {}')

    await expect(lib.plugins.load('bad-plugin')).rejects.toThrow('No manifest.json')
  })

  it('throws when loading duplicate plugin', async () => {
    const pluginDir = join(tempDir, 'lib', '.banjuan', 'plugins', 'dup-plugin')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      id: 'dup-plugin', name: 'Dup', version: '1.0.0', apiVersion: '1',
    }))
    writeFileSync(join(pluginDir, 'index.js'), `
      import { BanjuanPlugin } from 'file://${DIST_PATH}'
      export default class DupPlugin extends BanjuanPlugin {
        async onload() {}
        async onunload() {}
      }
    `)

    await lib.plugins.load('dup-plugin')
    await expect(lib.plugins.load('dup-plugin')).rejects.toThrow('already loaded')
  })
})
