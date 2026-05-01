import { useCallback, useRef } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from '@xyflow/react'
import type { MindmapNodeData } from './useMindmapStore.js'

const elk = new ELK()

interface LayoutOptions {
  layout: string
  nodeSizes: Map<string, { width: number; height: number }>
}

function getElkOptions(layout: string): Record<string, string> {
  const common: Record<string, string> = {
    'elk.algorithm': 'mrtree',
    'elk.spacing.nodeNode': '40',
    'elk.mrtree.weighting': 'MODEL_ORDER',
  }

  switch (layout) {
    case 'mindmap':
      return { ...common, 'elk.direction': 'RIGHT' }
    case 'logical':
      return { ...common, 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '30' }
    case 'organization':
      return { ...common, 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '50' }
    default:
      return { ...common, 'elk.direction': 'RIGHT' }
  }
}

function getVisibleNodes(nodes: Node<MindmapNodeData>[]): Set<string> {
  const collapsed = new Set<string>()
  for (const n of nodes) {
    if (n.data.collapsed) collapsed.add(n.id)
  }

  const visible = new Set<string>()
  const childrenMap = new Map<string, string[]>()
  let rootId: string | null = null

  for (const n of nodes) {
    if (!n.data.parentId) rootId = n.id
    else {
      const siblings = childrenMap.get(n.data.parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(n.data.parentId, siblings)
    }
  }

  function walk(id: string) {
    visible.add(id)
    if (collapsed.has(id)) return
    for (const childId of childrenMap.get(id) ?? []) {
      walk(childId)
    }
  }
  if (rootId) walk(rootId)
  return visible
}

async function layoutMindmap(
  nodes: Node<MindmapNodeData>[],
  edges: Edge[],
  options: LayoutOptions,
): Promise<{ nodes: Node<MindmapNodeData>[]; edges: Edge[] }> {
  const visible = getVisibleNodes(nodes)
  const visibleNodes = nodes.filter(n => visible.has(n.id))

  const defaultSize = { width: 160, height: 44 }

  if (options.layout === 'mindmap') {
    return layoutBalancedMindmap(visibleNodes, edges, options, defaultSize)
  }

  const elkOptions = getElkOptions(options.layout)
  const elkNodes = visibleNodes.map(n => {
    const size = options.nodeSizes.get(n.id) ?? defaultSize
    return { id: n.id, width: size.width, height: size.height }
  })

  const treeEdges = edges.filter(e => e.type === 'treeEdge' && visible.has(e.source) && visible.has(e.target))
  const elkEdges = treeEdges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))

  const graph = await elk.layout({
    id: 'root',
    layoutOptions: elkOptions,
    children: elkNodes,
    edges: elkEdges,
  })

  const posMap = new Map<string, { x: number; y: number }>()
  for (const child of graph.children ?? []) {
    posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  const layoutedNodes = nodes.map(n => {
    const pos = posMap.get(n.id)
    if (pos) return { ...n, position: pos, hidden: false }
    if (!visible.has(n.id)) return { ...n, hidden: true }
    return n
  })

  return { nodes: layoutedNodes, edges }
}

async function layoutBalancedMindmap(
  visibleNodes: Node<MindmapNodeData>[],
  edges: Edge[],
  options: LayoutOptions,
  defaultSize: { width: number; height: number },
): Promise<{ nodes: Node<MindmapNodeData>[]; edges: Edge[] }> {
  const root = visibleNodes.find(n => !n.data.parentId)
  if (!root) return { nodes: visibleNodes, edges }

  const directChildren = visibleNodes.filter(n => n.data.parentId === root.id)
  const midpoint = Math.ceil(directChildren.length / 2)
  const rightChildIds = new Set(directChildren.slice(0, midpoint).map(n => n.id))
  const leftChildIds = new Set(directChildren.slice(midpoint).map(n => n.id))

  function getSubtreeIds(parentId: string): Set<string> {
    const ids = new Set<string>([parentId])
    let changed = true
    while (changed) {
      changed = false
      for (const n of visibleNodes) {
        if (n.data.parentId && ids.has(n.data.parentId) && !ids.has(n.id)) {
          ids.add(n.id)
          changed = true
        }
      }
    }
    return ids
  }

  const rightSubtreeIds = new Set<string>()
  for (const id of rightChildIds) {
    for (const sid of getSubtreeIds(id)) rightSubtreeIds.add(sid)
  }
  const leftSubtreeIds = new Set<string>()
  for (const id of leftChildIds) {
    for (const sid of getSubtreeIds(id)) leftSubtreeIds.add(sid)
  }

  const rightNodes = visibleNodes.filter(n => rightSubtreeIds.has(n.id) || n.id === root.id)
  const leftNodes = visibleNodes.filter(n => leftSubtreeIds.has(n.id) || n.id === root.id)

  const treeEdges = edges.filter(e => e.type === 'treeEdge')

  async function layoutSide(sideNodes: Node<MindmapNodeData>[], direction: string) {
    const elkNodes = sideNodes.map(n => {
      const size = options.nodeSizes.get(n.id) ?? defaultSize
      return { id: n.id, width: size.width, height: size.height }
    })
    const sideIds = new Set(sideNodes.map(n => n.id))
    const sideEdges = treeEdges
      .filter(e => sideIds.has(e.source) && sideIds.has(e.target))
      .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))

    return elk.layout({
      id: `side-${direction}`,
      layoutOptions: { ...getElkOptions('logical'), 'elk.direction': direction },
      children: elkNodes,
      edges: sideEdges,
    })
  }

  const [rightResult, leftResult] = await Promise.all([
    rightNodes.length > 1 ? layoutSide(rightNodes, 'RIGHT') : null,
    leftNodes.length > 1 ? layoutSide(leftNodes, 'LEFT') : null,
  ])

  const posMap = new Map<string, { x: number; y: number }>()
  const rootSize = options.nodeSizes.get(root.id) ?? defaultSize

  posMap.set(root.id, { x: 0, y: 0 })

  if (rightResult) {
    const rootInRight = rightResult.children?.find(c => c.id === root.id)
    const offsetX = rootSize.width + 80
    const offsetY = -(rootInRight?.y ?? 0)
    for (const child of rightResult.children ?? []) {
      if (child.id !== root.id) {
        posMap.set(child.id, { x: (child.x ?? 0) - (rootInRight?.x ?? 0) + offsetX, y: (child.y ?? 0) + offsetY })
      }
    }
  }

  if (leftResult) {
    const rootInLeft = leftResult.children?.find(c => c.id === root.id)
    const offsetY = -(rootInLeft?.y ?? 0)
    for (const child of leftResult.children ?? []) {
      if (child.id !== root.id) {
        const childWidth = options.nodeSizes.get(child.id)?.width ?? defaultSize.width
        posMap.set(child.id, { x: -((rootInLeft?.x ?? 0) - (child.x ?? 0)) - childWidth - 80, y: (child.y ?? 0) + offsetY })
      }
    }
  }

  const allNodes = visibleNodes.map(n => {
    const pos = posMap.get(n.id)
    return pos ? { ...n, position: pos, hidden: false } : n
  })

  return { nodes: allNodes, edges }
}

export function useLayoutEngine() {
  const nodeSizesRef = useRef(new Map<string, { width: number; height: number }>())

  const setNodeSize = useCallback((nodeId: string, width: number, height: number) => {
    nodeSizesRef.current.set(nodeId, { width, height })
  }, [])

  const computeLayout = useCallback(async (
    nodes: Node<MindmapNodeData>[],
    edges: Edge[],
    layout: string,
  ): Promise<{ nodes: Node<MindmapNodeData>[]; edges: Edge[] }> => {
    if (nodes.length === 0) return { nodes, edges }
    return layoutMindmap(nodes, edges, { layout, nodeSizes: nodeSizesRef.current })
  }, [])

  return { computeLayout, setNodeSize, nodeSizesRef }
}
