import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DebouncedSaver } from './debouncedSaver.js'

describe('DebouncedSaver', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('runs only the latest scheduled save once the delay passes', () => {
    const saver = new DebouncedSaver(800)
    const runs: string[] = []
    saver.schedule(() => { runs.push('a') })
    vi.advanceTimersByTime(500)
    saver.schedule(() => { runs.push('b') })
    vi.advanceTimersByTime(799)
    expect(runs).toEqual([])
    vi.advanceTimersByTime(1)
    expect(runs).toEqual(['b'])
  })

  it('flush runs the pending save immediately and cancels the timer', () => {
    const saver = new DebouncedSaver(800)
    const run = vi.fn()
    saver.schedule(run)
    saver.flush()
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(run).toHaveBeenCalledTimes(1)
    expect(saver.hasPending).toBe(false)
  })

  it('flush is a no-op when nothing is pending', () => {
    const saver = new DebouncedSaver(800)
    expect(() => saver.flush()).not.toThrow()
    const run = vi.fn()
    saver.schedule(run)
    vi.advanceTimersByTime(800)
    saver.flush()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('returns the save promise from flush so callers can await it', async () => {
    const saver = new DebouncedSaver(800)
    let done = false
    saver.schedule(async () => { done = true })
    await saver.flush()
    expect(done).toBe(true)
  })
})
