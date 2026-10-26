import { describe, it, expect } from 'vitest'
import { KeyedLock } from './keyed-lock.js'

const tick = () => new Promise(r => setTimeout(r, 1))

describe('KeyedLock', () => {
  it('runs jobs for one key one after another, in order, even if one fails', async () => {
    const lock = new KeyedLock()
    const log: string[] = []
    const job = (name: string, fail = false) => async () => { log.push(`${name}:start`); await tick(); log.push(`${name}:end`); if (fail) throw new Error(name) }
    const a = lock.run('f', job('a'))
    const b = lock.run('f', job('b', true))
    const c = lock.run('f', job('c'))
    await a; await expect(b).rejects.toThrow('b'); await c
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
  })

  it('does not serialize different keys', async () => {
    const lock = new KeyedLock()
    const log: string[] = []
    const job = (name: string) => async () => { log.push(`${name}:start`); await tick(); log.push(`${name}:end`) }
    await Promise.all([lock.run('x', job('x')), lock.run('y', job('y'))])
    expect(log.slice(0, 2).sort()).toEqual(['x:start', 'y:start'])
  })
})
