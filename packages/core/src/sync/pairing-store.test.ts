import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { PairingStore } from './pairing-store.js'

describe('PairingStore', () => {
  let root: string
  let store: PairingStore
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pair-')) + '/lib'
    mkdirSync(join(root, '.banjuan'), { recursive: true })
    store = new PairingStore(root, new NodeFS())
  })

  it('starts empty', async () => {
    expect(await store.list()).toEqual([])
    expect(await store.hasToken('x')).toBe(false)
    expect(await store.findByDeviceId('d1')).toBeUndefined()
  })

  it('adds, finds, validates token, lists', async () => {
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad', peerLibraryId: 'L1', token: 'tok1' })
    expect((await store.list()).length).toBe(1)
    expect((await store.findByDeviceId('d1'))?.token).toBe('tok1')
    expect(await store.hasToken('tok1')).toBe(true)
    expect(await store.hasToken('nope')).toBe(false)
    const rec = await store.findByDeviceId('d1')
    expect(rec?.linkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('dedupes by peerDeviceId (re-link updates token)', async () => {
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad', peerLibraryId: 'L1', token: 'tok1' })
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad Pro', peerLibraryId: 'L1', token: 'tok2' })
    const list = await store.list()
    expect(list.length).toBe(1)
    expect(list[0].token).toBe('tok2')
    expect(list[0].peerDeviceName).toBe('iPad Pro')
    expect(await store.hasToken('tok1')).toBe(false)
  })

  it('removes by deviceId', async () => {
    await store.addOrUpdate({ peerDeviceId: 'd1', peerDeviceName: 'iPad', peerLibraryId: 'L1', token: 'tok1' })
    await store.removeByDeviceId('d1')
    expect(await store.list()).toEqual([])
    expect(await store.hasToken('tok1')).toBe(false)
  })
})
