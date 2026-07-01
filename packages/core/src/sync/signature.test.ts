import { describe, it, expect, vi } from 'vitest'
import { SyncService } from './service.js'
import type { PlatformFS } from '../platform/index.js'
import type { PlatformCrypto } from '../platform/crypto.js'

// Regression: hashing a multi-GB file reads it wholly into memory, which OOMs
// the app on mobile (CapacitorFS base64 readFile). Large files must fall back
// to a (size,mtime) signature without ever reading their content.
describe('SyncService.signature large-file fallback', () => {
  const KB = 1024
  const MB = 1024 * KB

  function make(readFile: PlatformFS['readFile']) {
    const crypto: PlatformCrypto = { sha256: vi.fn(async () => 'DEADBEEF') } as any
    const fs = { readFile } as unknown as PlatformFS
    const adapter = {} as any
    const svc = new SyncService('/root', adapter, undefined, fs, undefined, crypto)
    return { svc: svc as any, crypto, fs }
  }

  it('hashes small files (reads content)', async () => {
    const readFile = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const { svc, crypto } = make(readFile)
    const sig = await svc.signature('/root/a.pdf', 3 * MB, 1000)
    expect(sig).toBe('h:DEADBEEF')
    expect(readFile).toHaveBeenCalledOnce()
    expect(crypto.sha256).toHaveBeenCalledOnce()
  })

  it('never reads content for files above the hash threshold', async () => {
    const readFile = vi.fn(async () => { throw new Error('should not read huge file') })
    const { svc, crypto } = make(readFile)
    const size = 1_449_101_699 // the 1.45GB video that crashed the app
    const sig = await svc.signature('/root/big.mp4', size, 42)
    expect(sig).toBe(`a:${size}:42`)
    expect(readFile).not.toHaveBeenCalled()
    expect(crypto.sha256).not.toHaveBeenCalled()
  })
})
