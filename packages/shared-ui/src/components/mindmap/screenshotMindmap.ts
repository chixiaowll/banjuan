import { toPng, toSvg } from 'html-to-image'
import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import type { Node } from '@xyflow/react'

interface BoundsContext {
  nodes: Node[]
  boundaries: Array<{ nodeIds: string[] }>
  summaries: Array<{ nodeIds: string[]; summaryNodeId: string }>
}

export function computeFullBounds(ctx: BoundsContext) {
  const { nodes, boundaries, summaries } = ctx
  const nodeBounds = getNodesBounds(nodes)
  let minX = nodeBounds.x, minY = nodeBounds.y
  let maxX = nodeBounds.x + nodeBounds.width, maxY = nodeBounds.y + nodeBounds.height

  const BOUNDARY_PAD = 24
  for (const b of boundaries) {
    for (const n of nodes.filter(n => b.nodeIds.includes(n.id))) {
      const w = n.measured?.width ?? n.width ?? 160
      const h = n.measured?.height ?? n.height ?? 40
      minX = Math.min(minX, n.position.x - BOUNDARY_PAD)
      minY = Math.min(minY, n.position.y - BOUNDARY_PAD)
      maxX = Math.max(maxX, n.position.x + w + BOUNDARY_PAD)
      maxY = Math.max(maxY, n.position.y + h + BOUNDARY_PAD)
    }
  }

  const BRACE_W = 20, SUMMARY_GAP = 16
  for (const s of summaries) {
    const sNode = nodes.find(n => n.id === s.summaryNodeId)
    if (sNode) {
      maxX = Math.max(maxX, sNode.position.x + (sNode.measured?.width ?? sNode.width ?? 160))
      maxY = Math.max(maxY, sNode.position.y + (sNode.measured?.height ?? sNode.height ?? 40))
    }
    for (const n of nodes.filter(n => s.nodeIds.includes(n.id))) {
      maxX = Math.max(maxX, n.position.x + (n.measured?.width ?? n.width ?? 160) + SUMMARY_GAP + BRACE_W)
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export async function screenshotViewport(
  rfViewport: HTMLElement,
  ctx: BoundsContext,
  options?: { pixelRatio?: number; format?: 'png' | 'svg' },
): Promise<string> {
  const bounds = computeFullBounds(ctx)
  const margin = 40
  const imgWidth = Math.ceil(bounds.width + margin * 2)
  const imgHeight = Math.ceil(bounds.height + margin * 2)
  const vp = getViewportForBounds(bounds, imgWidth, imgHeight, 0.5, 2, `${margin}px`)
  const pixelRatio = options?.pixelRatio ?? 2
  const exporter = options?.format === 'svg' ? toSvg : toPng

  return exporter(rfViewport, {
    backgroundColor: options?.format === 'svg' ? undefined : '#ffffff',
    width: imgWidth,
    height: imgHeight,
    pixelRatio: options?.format === 'svg' ? 1 : pixelRatio,
    style: {
      width: `${imgWidth}px`,
      height: `${imgHeight}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  })
}
