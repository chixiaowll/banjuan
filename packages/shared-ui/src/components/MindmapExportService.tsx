import { screenshotViewport } from './mindmap/screenshotMindmap.js'
import type { Node } from '@xyflow/react'

type RenderRequest = {
  noteId: string
  resolve: (dataUrl: string | null) => void
}

const pendingQueue: RenderRequest[] = []

export function renderMindmapToImage(noteId: string): Promise<string | null> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(null), 60000)
    pendingQueue.push({
      noteId,
      resolve: (result) => { clearTimeout(timeout); resolve(result) },
    })
    document.dispatchEvent(new CustomEvent('mindmap-export-request'))
  })
}

export function _dequeueMindmapExport(): RenderRequest | undefined {
  return pendingQueue.shift()
}

function readNodesFromDom(container: HTMLElement): Node[] {
  const nodeEls = container.querySelectorAll('.react-flow__node')
  const nodes: Node[] = []
  nodeEls.forEach(el => {
    const htmlEl = el as HTMLElement
    const id = htmlEl.getAttribute('data-id') || ''
    const style = htmlEl.style
    const transform = style.transform || ''
    const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/)
    if (!match) return
    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    const rect = htmlEl.getBoundingClientRect()
    nodes.push({
      id,
      position: { x, y },
      data: {},
      measured: { width: htmlEl.offsetWidth || rect.width, height: htmlEl.offsetHeight || rect.height },
    } as Node)
  })
  return nodes
}

export async function captureMindmapFromTabPanel(tabPanelEl: HTMLElement): Promise<string | null> {
  const canvas = tabPanelEl.querySelector('.mindmap-canvas') as HTMLElement | null
  if (!canvas) return null
  const rfViewport = canvas.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!rfViewport) return null

  const nodes = readNodesFromDom(canvas)
  if (nodes.length === 0) return null

  const ctx = { nodes, boundaries: [], summaries: [] }

  try {
    return await screenshotViewport(rfViewport, ctx, { pixelRatio: 3 })
  } catch {
    return null
  }
}

export default function MindmapExportService() {
  return null
}
