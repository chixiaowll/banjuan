/**
 * Touch screens have no right click, and iOS web views never fire
 * `contextmenu`, so on iPad the folder / document / note menus (rename, move,
 * delete…) couldn't be opened. A long press — finger held still for
 * LONG_PRESS_MS — inside an element marked `data-long-press-menu` dispatches a
 * contextmenu event at the press point, which opens the same menus as a right
 * click. Elsewhere (readers, editors, canvases) long presses keep their own
 * meaning, like selecting text.
 */

export const LONG_PRESS_MS = 500
const MOVE_SLOP = 10

export function installLongPressMenu(root: Window | HTMLElement = window): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start = { x: 0, y: 0 }
  // After a long press, the release must not also click — or, with an earlier
  // tap, double-click (open) — the item: swallow those until shortly after it.
  let swallowUntil = 0
  const SWALLOW_MS = 400
  const cancel = () => { if (timer) clearTimeout(timer); timer = undefined }

  const onDown = (e: Event) => {
    const ev = e as PointerEvent
    swallowUntil = 0
    cancel()
    if (ev.pointerType !== 'touch') return
    const target = ev.target as Element | null
    if (!target?.closest?.('[data-long-press-menu]')) return
    start = { x: ev.clientX, y: ev.clientY }
    timer = setTimeout(() => {
      timer = undefined
      swallowUntil = Infinity   // until the finger lifts
      target.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, composed: true, button: 2, clientX: start.x, clientY: start.y,
      }))
    }, LONG_PRESS_MS)
  }
  const onMove = (e: Event) => {
    const ev = e as PointerEvent
    if (timer && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > MOVE_SLOP) cancel()   // a scroll or a drag
  }
  const onUp = () => {
    cancel()
    if (swallowUntil === Infinity) swallowUntil = Date.now() + SWALLOW_MS
  }
  const swallow = (e: Event) => {
    if (Date.now() >= swallowUntil) return
    e.preventDefault()
    e.stopPropagation()
  }

  root.addEventListener('pointerdown', onDown, true)
  root.addEventListener('pointermove', onMove, true)
  root.addEventListener('pointerup', onUp, true)
  root.addEventListener('pointercancel', onUp, true)
  root.addEventListener('click', swallow, true)
  root.addEventListener('dblclick', swallow, true)
  return () => {
    cancel()
    root.removeEventListener('pointerdown', onDown, true)
    root.removeEventListener('pointermove', onMove, true)
    root.removeEventListener('pointerup', onUp, true)
    root.removeEventListener('pointercancel', onUp, true)
    root.removeEventListener('click', swallow, true)
    root.removeEventListener('dblclick', swallow, true)
  }
}
