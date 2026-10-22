import { describe, it, expect } from 'vitest'
import { initHistory, commit, undo, redo, canUndo, canRedo } from './history.js'

describe('history', () => {
  it('undoes and redoes commits, and a new commit clears the redo stack', () => {
    let h = initHistory<number[]>([])
    h = commit(h, [1])
    h = commit(h, [1, 2])
    expect(h.present).toEqual([1, 2])
    h = undo(h)
    expect(h.present).toEqual([1])
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toEqual([1, 2])
    h = undo(undo(h))
    expect(h.present).toEqual([])
    expect(canUndo(h)).toBe(false)
    h = commit(h, [9])
    expect(canRedo(h)).toBe(false)
  })
  it('undo/redo at the ends and committing the same value are no-ops', () => {
    const h = initHistory([1])
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
    expect(commit(h, h.present)).toBe(h)
  })
})
