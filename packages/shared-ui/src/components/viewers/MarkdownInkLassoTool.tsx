import React, { useMemo } from 'react'
import { useMarkdownViewer } from './MarkdownViewerContext.js'
import { useInkLasso, type LassoFrame } from './useInkLasso.js'
import { inkEntries } from './inkLasso.js'

/**
 * Ink lasso over a Markdown document. The canvas covers the whole scrollable
 * content; ink x is a fraction of the content width, y is pixels from the top.
 */

interface Props {
  annotations: any[]
  scrollContainer: HTMLElement | null
  onUpdated: () => void
}

export default function MarkdownInkLassoTool({ annotations, scrollContainer, onUpdated }: Props) {
  const ctx = useMarkdownViewer()
  const active = ctx.activeTool === 'lasso'
  const entries = useMemo(() => inkEntries(annotations), [annotations])

  const lasso = useInkLasso({
    active, entries, onUpdated, stopPropagation: true,
    resizeTargets: scrollContainer ? [scrollContainer, ...Array.from(scrollContainer.children)] : [],
    measure: (canvas): LassoFrame | null => {
      if (!scrollContainer) return null
      const W = scrollContainer.scrollWidth, H = scrollContainer.scrollHeight
      const r = canvas.getBoundingClientRect()
      return {
        w: W, h: H, fixedCssSize: true,
        toWork: p => ({ x: p.x * W, y: p.y }),
        workDeltaToStored: d => ({ x: d.x / W, y: d.y }),
        eventToWork: e => ({ x: e.clientX - r.left, y: e.clientY - r.top }),
      }
    },
  })

  if (!active && lasso.strokeCount === 0) return null

  return (
    <>
      <canvas
        ref={lasso.canvasRef}
        {...lasso.handlers}
        style={{
          position: 'absolute', top: 0, left: 0,
          pointerEvents: active ? 'auto' : 'none',
          cursor: lasso.cursor,
          zIndex: active ? 11 : 2,
          touchAction: 'none',
        }}
      />
      {lasso.menu}
    </>
  )
}
