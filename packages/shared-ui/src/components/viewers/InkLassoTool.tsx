import React, { useMemo, useRef } from 'react'
import { useInkLasso, type LassoFrame } from './useInkLasso.js'
import { inkEntries } from './inkLasso.js'

/** Ink lasso on one PDF page. Ink is stored as fractions of the page size. */

interface Props {
  active: boolean
  pageNum: number
  /** The page's annotations (ink is picked out here). */
  annotations: any[]
  onUpdated: () => void
}

export default function InkLassoTool({ active, pageNum, annotations, onUpdated }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const entries = useMemo(() => inkEntries(annotations, a => a.page === pageNum), [annotations, pageNum])

  const lasso = useInkLasso({
    active, entries, onUpdated,
    measure: (): LassoFrame | null => {
      const el = wrapRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      const w = r.width, h = r.height
      return {
        w, h,
        toWork: p => ({ x: p.x * w, y: p.y * h }),
        workDeltaToStored: d => ({ x: d.x / w, y: d.y / h }),
        eventToWork: e => ({ x: e.clientX - r.left, y: e.clientY - r.top }),
      }
    },
  })

  if (!active && lasso.strokeCount === 0) return null

  return (
    <div
      ref={wrapRef}
      {...lasso.handlers}
      style={{
        position: 'absolute', inset: 0,
        cursor: lasso.cursor,
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : 2,
        touchAction: 'none',
      }}
    >
      <canvas ref={lasso.canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      {lasso.menu}
    </div>
  )
}
