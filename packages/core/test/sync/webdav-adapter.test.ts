import { describe, it, expect, beforeEach } from 'vitest'
import { WebDAVAdapter } from '../../src/sync/webdav-adapter.js'
import type { SyncConfig } from '../../src/types.js'

describe('WebDAVAdapter', () => {
  let adapter: WebDAVAdapter

  beforeEach(() => {
    adapter = new WebDAVAdapter()
  })

  it('throws if not connected', async () => {
    await expect(adapter.list('/')).rejects.toThrow('Not connected')
  })

  it('connect creates a client', async () => {
    const config: SyncConfig = {
      type: 'webdav',
      url: 'https://example.com/dav',
      username: 'user',
      password: 'pass',
      remotePath: '/banjuan',
    }
    await adapter.connect(config)
    await adapter.disconnect()
  })
})
