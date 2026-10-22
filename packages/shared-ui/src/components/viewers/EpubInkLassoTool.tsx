import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'
import { useInkLasso, type LassoFrame } from './useInkLasso.js'
import { inkEntries } from './inkLasso.js'

/**
 * Ink lasso over an EPUB in scrolled mode. The canvas covers the visible part
 * of the (possibly CSS-scaled) container and follows the epub.js scroll
 * container. Ink x is a fraction of the container's width, y is in document
 * pixels — the lasso works in that document space so a selection stays put
 * while the book scrolls under it.
 */

interface Props {
  annotations: any[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onUpdated: () => void
}

/** On-screen size ÷ layout size of the (zoomed) container. */
function getScale(el: HTMLElement): number {
  return el.clientWidth ? el.getBoundingClientRect().width / el.clientWidth : 1
}

export default function EpubInkLassoTool({ annotations, containerRef, onUpdated }: Props) {
  const ctx = useEpubViewer()
  const active = ctx.activeTool === 'lasso'
  const entries = useMemo(() => inkEntries(annotations), [annotations])
  const scrollTopRef = useRef(0)

  const lasso = useInkLasso({
    active, entries, onUpdated,
    ignorePointer: e => e.pointerType === 'touch',   // touch scrolls the book
    measure: (): LassoFrame | null => {
      const container = containerRef.current
      if (!container) return null
      const W = container.clientWidth, H = container.clientHeight
      if (!W || !H) return null
      const r = container.getBoundingClientRect()
      const scale = getScale(container)
      const st = scrollTopRef.current
      return {
        w: W, h: H, fixedCssSize: true,
        toWork: p => ({ x: p.x * W, y: p.y }),
        workDeltaToStored: d => ({ x: d.x / W, y: d.y }),
        eventToWork: e => ({ x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale + st }),
        workToCanvas: p => ({ x: p.x, y: p.y - st }),
      }
    },
  })
  const { redraw, canvasRef } = lasso

  // epub.js creates its scroll container after rendering; wait for it.
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const find = () => {
      if (cancelled) return
      const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
      if (sc) setScrollContainer(sc)
      else timer = setTimeout(find, 100)
    }
    find()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [containerRef, ctx.rendition])

  // Scroll → repaint on the next frame (no React state in the hot path).
  useEffect(() => {
    if (!scrollContainer) return
    let raf = 0
    const onScroll = () => {
      scrollTopRef.current = scrollContainer.scrollTop
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(redraw)
    }
    scrollTopRef.current = scrollContainer.scrollTop
    redraw()
    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => { scrollContainer.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [scrollContainer, redraw])

  // The lasso layer sits on top while active; pass the wheel through to the book.
  useEffect(() => {
    const canvas = canvasRef.current?.parentElement
    const container = containerRef.current
    if (!canvas || !scrollContainer || !active || !container) return
    const onWheel = (e: WheelEvent) => {
      scrollContainer.scrollBy({ top: e.deltaY / getScale(container) })
      e.preventDefault()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [scrollContainer, active, containerRef, canvasRef])

  if (!active && lasso.strokeCount === 0) return null

  return (
    <div
      {...lasso.handlers}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        cursor: lasso.cursor,
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : 2,
        touchAction: 'pan-y',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      {lasso.menu}
    </div>
  )
}
