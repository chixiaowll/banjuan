import { describe, it, expect } from 'vitest'
import { registerFlush, flushAll } from './flushRegistry.js'

describe('flushRegistry', () => {
  it('runs every "collect" step before any "write" step, and waits for the writes', async () => {
    const log: string[] = []
    const offA = registerFlush(async () => { await new Promise(r => setTimeout(r, 20)); log.push('write A') }, 'write')
    const offB = registerFlush(() => { log.push('collect B') }, 'collect')
    await flushAll()
    expect(log).toEqual(['collect B', 'write A'])
    offA(); offB()
  })

  it('a failing flusher does not stop the others, and unregistered ones are skipped', async () => {
    const log: string[] = []
    const off1 = registerFlush(() => { throw new Error('boom') }, 'write')
    const off2 = registerFlush(() => { log.push('ok') }, 'write')
    const off3 = registerFlush(() => { log.push('removed') }, 'write')
    off3()
    await flushAll()
    expect(log).toEqual(['ok'])
    off1(); off2()
  })
})
