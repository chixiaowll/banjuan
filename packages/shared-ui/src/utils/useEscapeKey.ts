import { useEffect, useRef } from 'react'

/**
 * Esc closes the topmost open overlay (dialog, menu, popover). Overlays push
 * themselves on a stack while open and one capture-phase listener calls only
 * the top one — so Esc in a confirm dialog over a rename dialog closes just the
 * confirm, and the key never reaches the editor underneath.
 */
const stack: Array<{ current: () => void }> = []
let installed = false

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing || stack.length === 0) return
  e.preventDefault()
  e.stopPropagation()
  stack[stack.length - 1].current()
}

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const ref = useRef(onEscape)
  ref.current = onEscape
  useEffect(() => {
    if (!active) return
    if (!installed) {
      window.addEventListener('keydown', onKeyDown, true)
      installed = true
    }
    const entry = ref
    stack.push(entry)
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [active])
}
