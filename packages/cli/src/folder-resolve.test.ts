import { describe, it, expect } from 'vitest'
import { resolveFolder } from './folder-resolve.js'

const DIRS = [
  '[0] DailyNotes',
  '[1] Projects',
  '[1] Projects/[2026Q2] 财经日历优化',
  '[1] Projects/[2026Q2] 自选抽屉模型优化',
]

describe('resolveFolder', () => {
  it('matches an exact path', () => {
    expect(resolveFolder('[1] Projects/[2026Q2] 财经日历优化', DIRS))
      .toEqual({ kind: 'exact', path: '[1] Projects/[2026Q2] 财经日历优化' })
  })

  it('auto-corrects a path missing the [N] order prefix (the real bug)', () => {
    expect(resolveFolder('Projects/[2026Q2] 自选抽屉模型优化', DIRS))
      .toEqual({ kind: 'normalized', path: '[1] Projects/[2026Q2] 自选抽屉模型优化' })
  })

  it('matches a top-level folder without its prefix', () => {
    expect(resolveFolder('Projects', DIRS)).toEqual({ kind: 'normalized', path: '[1] Projects' })
  })

  it('keeps non-numeric bracket tags like [2026Q2]', () => {
    // a bare quarter tag must NOT be stripped, so this is genuinely not found
    expect(resolveFolder('[2026Q2] 财经日历优化', DIRS)).toEqual({ kind: 'notFound' })
  })

  it('reports notFound instead of inventing a folder', () => {
    expect(resolveFolder('Marketing/Q3', DIRS)).toEqual({ kind: 'notFound' })
  })

  it('reports ambiguity when two folders normalize the same', () => {
    const dirs = ['[0] Inbox', '[1] Inbox']
    const r = resolveFolder('Inbox', dirs)
    expect(r.kind).toBe('ambiguous')
    expect((r as any).candidates).toEqual(['[0] Inbox', '[1] Inbox'])
  })
})
