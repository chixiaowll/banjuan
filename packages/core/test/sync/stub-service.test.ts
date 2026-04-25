import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from '../helpers.js'
import { StubService } from '../../src/sync/stub-service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'

class MockAdapter implements SyncAdapter {
  private files = new Map<string, Buffer>()

  async connect(_config: SyncConfig): Promise<void> {}
  async disconnect(): Promise<void> {}
  async list(_remotePath: string): Promise<RemoteFile[]> { return [] }
  async upload(localPath: string, remotePath: string): Promise<void> {
    this.files.set(remotePath, readFileSync(localPath))
  }
  async download(remotePath: string, localPath: string): Promise<void> {
    const data = this.files.get(remotePath)
    if (!data) throw new Error('Not found')
    mkdirSync(join(localPath, '..'), { recursive: true })
    writeFileSync(localPath, data)
  }
  async delete(_remotePath: string): Promise<void> {}
  async getMetadata(_remotePath: string): Promise<{ mtime: number; size: number }> {
    return { mtime: Date.now(), size: 0 }
  }
  async mkdir(_remotePath: string): Promise<void> {}

  seed(remotePath: string, content: Buffer): void {
    this.files.set(remotePath, content)
  }
  has(remotePath: string): boolean {
    return this.files.has(remotePath)
  }
}

describe('StubService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string
  let adapter: MockAdapter
  let stubService: StubService

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
    adapter = new MockAdapter()
    stubService = new StubService(libPath, adapter)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('createStub', () => {
    it('creates a stub file', () => {
      stubService.createStub({ id: 'doc-123', hash: 'abc123', size: 5242880, remotePath: 'papers/attention.pdf' })

      const stubPath = join(libPath, '.banjuan', 'stubs', 'do', 'doc-123.stub.json')
      expect(existsSync(stubPath)).toBe(true)

      const data = JSON.parse(readFileSync(stubPath, 'utf-8'))
      expect(data.id).toBe('doc-123')
      expect(data.remotePath).toBe('papers/attention.pdf')
    })
  })

  describe('listStubs', () => {
    it('lists all stubs', () => {
      stubService.createStub({ id: 'doc-1', hash: 'h1', size: 100, remotePath: 'a.pdf' })
      stubService.createStub({ id: 'doc-2', hash: 'h2', size: 200, remotePath: 'b.pdf' })
      const stubs = stubService.listStubs()
      expect(stubs).toHaveLength(2)
    })
  })

  describe('downloadFile', () => {
    it('downloads file from remote and removes stub', async () => {
      const pdfContent = Buffer.from('fake pdf content')
      adapter.seed('/papers/attention.pdf', pdfContent)

      stubService.createStub({ id: 'doc-dl', hash: 'h', size: pdfContent.length, remotePath: 'papers/attention.pdf' })

      await stubService.downloadFile('doc-dl', join(libPath, 'papers', 'attention.pdf'))

      expect(existsSync(join(libPath, 'papers', 'attention.pdf'))).toBe(true)
      expect(readFileSync(join(libPath, 'papers', 'attention.pdf'))).toEqual(pdfContent)

      const stubPath = join(libPath, '.banjuan', 'stubs', 'do', 'doc-dl.stub.json')
      expect(existsSync(stubPath)).toBe(false)
    })
  })

  describe('uploadFile', () => {
    it('uploads local file to remote', async () => {
      createTestFile(libPath, 'big.pdf', Buffer.from('large file'))
      await stubService.uploadFile(join(libPath, 'big.pdf'), 'big.pdf')
      expect(adapter.has('/big.pdf')).toBe(true)
    })
  })

  describe('getStatus', () => {
    it('returns local when file exists and no stub', () => {
      createTestFile(libPath, 'local.pdf', 'x')
      expect(stubService.getStatus('no-stub-id', join(libPath, 'local.pdf'))).toBe('local')
    })

    it('returns cloud when stub exists and no file', () => {
      stubService.createStub({ id: 'cloud-id', hash: 'h', size: 100, remotePath: 'x.pdf' })
      expect(stubService.getStatus('cloud-id', join(libPath, 'nonexistent.pdf'))).toBe('cloud')
    })
  })
})
