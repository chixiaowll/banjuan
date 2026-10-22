import { describe, it, expect } from 'vitest'
import { idleState, pointerDown, pointerMove, pointerUp, nudge, escape, rightClick, currentRect, handleAt, type Env, type SelState } from './selection.js'

const bounds = { x: 0, y: 0, w: 1000, h: 800 }
const win = { x: 100, y: 100, w: 300, h: 200 }
const env: Env = { bounds, windows: [win, bounds], locked: false }
const drag = (s: SelState, a: { x: number; y: number }, b: { x: number; y: number }, e = env) =>
  pointerUp(pointerMove(pointerDown(s, a, e), b, e), b, e)

describe('selection state machine', () => {
  it('hovering highlights the window under the cursor', () => {
    const s = pointerMove(idleState(), { x: 150, y: 150 }, env)
    expect(s).toEqual({ mode: 'idle', hover: win })
  })
  it('a click without dragging selects the hovered window', () => {
    const s = pointerUp(pointerDown(idleState(), { x: 150, y: 150 }, env), { x: 151, y: 151 }, env)
    expect(s).toEqual({ mode: 'selected', rect: win })
  })
  it('a drag selects the dragged rectangle, clamped to the display', () => {
    expect(currentRect(drag(idleState(), { x: 900, y: 700 }, { x: 1200, y: 600 }))).toEqual({ x: 900, y: 600, w: 100, h: 100 })
  })
  it('resizes by a corner handle and flips past the opposite edge', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 100, y: 100, w: 100, h: 100 } }
    expect(handleAt({ x: 200, y: 200 }, { x: 100, y: 100, w: 100, h: 100 })).toBe('se')
    expect(currentRect(drag(sel, { x: 200, y: 200 }, { x: 250, y: 260 }))).toEqual({ x: 100, y: 100, w: 150, h: 160 })
    expect(currentRect(drag(sel, { x: 200, y: 200 }, { x: 50, y: 50 }))).toEqual({ x: 50, y: 50, w: 50, h: 50 })
  })
  it('moves by dragging inside, never past the display edge', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 100, y: 100, w: 100, h: 100 } }
    expect(currentRect(drag(sel, { x: 150, y: 150 }, { x: 1150, y: 160 }))).toEqual({ x: 900, y: 110, w: 100, h: 100 })
  })
  it('once annotated (locked), the region cannot be moved, resized or replaced', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 100, y: 100, w: 100, h: 100 } }
    const locked = { ...env, locked: true }
    expect(drag(sel, { x: 150, y: 150 }, { x: 300, y: 300 }, locked)).toEqual(sel)
    expect(drag(sel, { x: 600, y: 600 }, { x: 700, y: 700 }, locked)).toEqual(sel)
  })
  it('arrow keys nudge the selection inside the display', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 0, y: 10, w: 100, h: 100 } }
    expect(currentRect(nudge(sel, -10, 5, env))).toEqual({ x: 0, y: 15, w: 100, h: 100 })
  })
  it('Esc and right-click drop the selection first, then exit (null)', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 0, y: 0, w: 10, h: 10 } }
    expect(escape(sel, false)).toEqual(idleState())
    expect(escape(sel, true)).toBeNull()
    expect(escape(idleState(), false)).toBeNull()
    expect(rightClick(sel)).toEqual(idleState())
    expect(rightClick(idleState())).toBeNull()
  })
})
