import { useRef, useCallback } from 'react'

export function useLongPress(callback: (e: React.PointerEvent) => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    timer.current = setTimeout(() => callback(e), delay)
  }, [callback, delay])

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return {
    onPointerDown,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  }
}
