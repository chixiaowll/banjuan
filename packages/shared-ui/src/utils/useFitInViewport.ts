import { useLayoutEffect, type RefObject } from 'react'

const MARGIN = 8

/**
 * Keep a fixed-position menu / popover inside the window: after each render,
 * if it overflows the right or bottom edge, shift it back in (before paint, so
 * there's no jump). Menus open at the pointer, which near an edge used to push
 * half the menu off-screen.
 */
export function useFitInViewport(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth - MARGIN) el.style.left = `${Math.max(MARGIN, window.innerWidth - r.width - MARGIN)}px`
    if (r.bottom > window.innerHeight - MARGIN) el.style.top = `${Math.max(MARGIN, window.innerHeight - r.height - MARGIN)}px`
  })
}
