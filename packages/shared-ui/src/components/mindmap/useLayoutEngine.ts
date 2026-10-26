import { useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { MindmapNodeData } from './useMindmapStore.js'
import { useNodeSizeStore } from './useNodeSizeStore.js'

interface LayoutOptions {
  layout: string
  nodeSizes: Map<string, { width: number; height: number }>
  summaries?: Array<{ id: string; nodeIds: string[]; summaryNodeId: string }>
}

const DEFAULT_SIZE = { width: 160, height: 40 }
const DEFAULT_SIZE_WITH_CONTENT = { width: 420, height: 260 }
const H_GAP = 48
const V_GAP = 32

function getVisibleIds(nodes: Node<MindmapNodeData>[]): Set<string> {
  const collapsed = new Set<string>()
  for (const n of nodes) {
    if (n.data.collapsed) collapsed.add(n.id)
  }

  const childrenMap = new Map<string, string[]>()

  for (const n of nodes) {
    if (n.data.parentId) {
      const siblings = childrenMap.get(n.data.parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(n.data.parentId, siblings)
    }
  }

  const visible = new Set<string>()
  function walk(id: string) {
    visible.add(id)
    if (collapsed.has(id)) return
    for (const childId of childrenMap.get(id) ?? []) walk(childId)
  }

  for (const n of nodes) {
    if (!n.data.parentId) walk(n.id)
  }
  return visible
}

interface TreeNode {
  id: string
  width: number
  height: number
  children: TreeNode[]
  subtreeHeight: number
  /** Organization chart only (measureWidths). */
  subtreeWidth?: number
  x: number
  y: number
}

/** Which way a node's branch grows from its parent — decides the edge's handles. */
type Side = 'right' | 'left' | 'down'
const ORG_H_GAP = 24
const ORG_V_GAP = 56

function buildTree(
  nodes: Node<MindmapNodeData>[],
  visible: Set<string>,
  sizes: Map<string, { width: number; height: number }>,
  rootId: string,
): TreeNode | null {
  const nodeMap = new Map<string, Node<MindmapNodeData>>()
  const childrenMap = new Map<string, Node<MindmapNodeData>[]>()
  let root: Node<MindmapNodeData> | null = null

  for (const n of nodes) {
    if (!visible.has(n.id)) continue
    nodeMap.set(n.id, n)
    if (n.id === rootId) root = n
    else if (n.data.parentId) {
      const siblings = childrenMap.get(n.data.parentId) ?? []
      siblings.push(n)
      childrenMap.set(n.data.parentId, siblings)
    }
  }

  if (!root) return null

  function build(node: Node<MindmapNodeData>): TreeNode {
    const size = sizes.get(node.id) ?? (node.data.content ? DEFAULT_SIZE_WITH_CONTENT : DEFAULT_SIZE)
    const children = (childrenMap.get(node.id) ?? [])
      .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
      .map(build)

    const childrenHeight = children.length > 0
      ? children.reduce((sum, c) => sum + c.subtreeHeight, 0) + (children.length - 1) * V_GAP
      : 0

    return {
      id: node.id,
      width: size.width,
      height: size.height,
      children,
      subtreeHeight: Math.max(size.height, childrenHeight),
      x: 0,
      y: 0,
    }
  }

  return build(root)
}

function assignPositions(node: TreeNode, x: number, y: number): void {
  node.x = x
  node.y = y + (node.subtreeHeight - node.height) / 2

  if (node.children.length === 0) return

  const childX = x + node.width + H_GAP
  let childY = y

  for (const child of node.children) {
    assignPositions(child, childX, childY)
    childY += child.subtreeHeight + V_GAP
  }
}

/** Branch growing to the left: mirror of assignPositions; `rightEdge` is where the node's right side sits. */
function assignPositionsLeft(node: TreeNode, rightEdge: number, y: number): void {
  node.x = rightEdge - node.width
  node.y = y + (node.subtreeHeight - node.height) / 2
  let childY = y
  for (const child of node.children) {
    assignPositionsLeft(child, node.x - H_GAP, childY)
    childY += child.subtreeHeight + V_GAP
  }
}

/** Mind-map layout: the root's branches split right and left, balanced by height. */
function assignBalanced(root: TreeNode, sides: Map<string, Side>): void {
  root.x = 0
  root.y = 0
  const total = root.children.reduce((sum, c) => sum + c.subtreeHeight, 0)
  const right: TreeNode[] = []
  const left: TreeNode[] = []
  let rightHeight = 0
  for (const c of root.children) {
    // First branches go right until that side holds about half; the rest go left.
    if (right.length === 0 || rightHeight + c.subtreeHeight / 2 <= total / 2) { right.push(c); rightHeight += c.subtreeHeight }
    else left.push(c)
  }
  const blockHeight = (list: TreeNode[]) => list.reduce((sum, c) => sum + c.subtreeHeight, 0) + Math.max(0, list.length - 1) * V_GAP
  const centerY = root.height / 2
  let y = centerY - blockHeight(right) / 2
  for (const c of right) {
    assignPositions(c, root.width + H_GAP, y)
    markSide(c, 'right', sides)
    y += c.subtreeHeight + V_GAP
  }
  y = centerY - blockHeight(left) / 2
  for (const c of left) {
    assignPositionsLeft(c, -H_GAP, y)
    markSide(c, 'left', sides)
    y += c.subtreeHeight + V_GAP
  }
}

function markSide(node: TreeNode, side: Side, sides: Map<string, Side>): void {
  sides.set(node.id, side)
  for (const c of node.children) markSide(c, side, sides)
}

/** Organization chart: children below their parent, side by side. */
function measureWidths(node: TreeNode): number {
  const childrenWidth = node.children.reduce((sum, c) => sum + measureWidths(c), 0) + Math.max(0, node.children.length - 1) * ORG_H_GAP
  node.subtreeWidth = Math.max(node.width, childrenWidth)
  return node.subtreeWidth
}

function assignPositionsDown(node: TreeNode, x: number, y: number): void {
  const width = node.subtreeWidth ?? node.width
  node.x = x + (width - node.width) / 2
  node.y = y
  const childrenWidth = node.children.reduce((sum, c) => sum + (c.subtreeWidth ?? c.width), 0) + Math.max(0, node.children.length - 1) * ORG_H_GAP
  let childX = x + (width - childrenWidth) / 2
  for (const child of node.children) {
    assignPositionsDown(child, childX, y + node.height + ORG_V_GAP)
    childX += (child.subtreeWidth ?? child.width) + ORG_H_GAP
  }
}

/** Lay out one tree from (0,0) in the chosen layout, recording each node's side. */
function layoutTree(tree: TreeNode, layout: string, sides: Map<string, Side>, isMainRoot: boolean): void {
  if (layout === 'organization') {
    measureWidths(tree)
    assignPositionsDown(tree, 0, 0)
    markSide(tree, 'down', sides)
  } else if (layout === 'mindmap' && isMainRoot) {
    assignBalanced(tree, sides)
  } else {
    assignPositions(tree, 0, 0)
    markSide(tree, 'right', sides)
  }
}

function shiftTree(node: TreeNode, dx: number, dy: number): void {
  node.x += dx
  node.y += dy
  for (const child of node.children) shiftTree(child, dx, dy)
}

function collectPositions(node: TreeNode, map: Map<string, { x: number; y: number }>): void {
  map.set(node.id, { x: node.x, y: node.y })
  for (const child of node.children) collectPositions(child, map)
}

export function layoutMindmap(
  nodes: Node<MindmapNodeData>[],
  edges: Edge[],
  options: LayoutOptions,
): { nodes: Node<MindmapNodeData>[]; edges: Edge[] } {
  const visible = getVisibleIds(nodes)

  const summaryNodeIds = new Set((options.summaries ?? []).map(s => s.summaryNodeId))
  const rootNode = nodes.find(n => !n.data.parentId && !n.data.floating)
  const floatingRoots = nodes.filter(n => n.data.floating && !n.data.parentId && !summaryNodeIds.has(n.id))

  const posMap = new Map<string, { x: number; y: number }>()
  const sides = new Map<string, Side>()

  let rootRenderedPos = { x: 0, y: 0 }

  if (rootNode) {
    const tree = buildTree(nodes, visible, options.nodeSizes, rootNode.id)
    if (tree) {
      layoutTree(tree, options.layout, sides, true)
      const rootDx = rootNode.data.positionX ?? 0
      const rootDy = rootNode.data.positionY ?? 0
      if (rootDx !== 0 || rootDy !== 0) {
        shiftTree(tree, rootDx, rootDy)
      }
      collectPositions(tree, posMap)
      rootRenderedPos = { x: tree.x, y: tree.y }
    }
  }

  for (const fr of floatingRoots) {
    if (!visible.has(fr.id)) continue
    const tree = buildTree(nodes, visible, options.nodeSizes, fr.id)
    if (tree) {
      layoutTree(tree, options.layout, sides, false)
      const absX = fr.data.positionX ?? (rootRenderedPos.x + 300)
      const absY = fr.data.positionY ?? (rootRenderedPos.y - 200)
      shiftTree(tree, absX - tree.x, absY - tree.y)
      collectPositions(tree, posMap)
    }
  }

  const BRACE_WIDTH = 20
  const BRACE_GAP = 16
  for (const s of options.summaries ?? []) {
    const matchedPositions: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const nid of s.nodeIds) {
      const pos = posMap.get(nid)
      if (!pos || !visible.has(nid)) continue
      const size = options.nodeSizes.get(nid) ?? DEFAULT_SIZE
      matchedPositions.push({ x: pos.x, y: pos.y, w: size.width, h: size.height })
    }
    if (matchedPositions.length === 0) continue
    let minY = Infinity, maxY = -Infinity, maxX = -Infinity
    for (const p of matchedPositions) {
      if (p.y < minY) minY = p.y
      if (p.y + p.h > maxY) maxY = p.y + p.h
      if (p.x + p.w > maxX) maxX = p.x + p.w
    }
    const sNode = nodes.find(n => n.id === s.summaryNodeId)
    const snSize = sNode ? (options.nodeSizes.get(s.summaryNodeId) ?? DEFAULT_SIZE) : DEFAULT_SIZE
    const braceX = maxX + BRACE_GAP
    const midY = (minY + maxY) / 2
    posMap.set(s.summaryNodeId, {
      x: braceX + BRACE_WIDTH + BRACE_GAP,
      y: midY - snSize.height / 2,
    })
  }

  const layoutedNodes = nodes.map(n => {
    const pos = posMap.get(n.id)
    if (pos) {
      const size = options.nodeSizes.get(n.id)
      return {
        ...n,
        position: pos,
        hidden: false,
        draggable: true,
        ...(size ? { width: size.width, height: size.height } : {}),
      }
    }
    if (!visible.has(n.id)) return { ...n, hidden: true }
    return n
  })

  const treeEdges: Edge[] = []
  for (const n of layoutedNodes) {
    if (n.data.parentId && visible.has(n.id)) {
      const side = sides.get(n.id) ?? 'right'
      treeEdges.push({
        id: `tree-${n.data.parentId}-${n.id}`,
        source: n.data.parentId,
        target: n.id,
        type: 'treeEdge',
        sourceHandle: side === 'left' ? 'source-left' : side === 'down' ? 'source-bottom' : 'source-right',
        targetHandle: side === 'left' ? 'target-right' : side === 'down' ? 'target-top' : 'target-left',
      })
    }
  }
  const relationEdges = edges.filter(e => e.type !== 'treeEdge')

  return { nodes: layoutedNodes, edges: [...treeEdges, ...relationEdges] }
}

export function useLayoutEngine() {
  const sizes = useNodeSizeStore(s => s.sizes)
  const sizeVersion = useNodeSizeStore(s => s.version)

  const computeLayout = useCallback((
    nodes: Node<MindmapNodeData>[],
    edges: Edge[],
    layout: string,
    summaries?: Array<{ id: string; nodeIds: string[]; summaryNodeId: string }>,
  ): { nodes: Node<MindmapNodeData>[]; edges: Edge[] } => {
    if (nodes.length === 0) return { nodes, edges }
    return layoutMindmap(nodes, edges, { layout, nodeSizes: sizes, summaries })
  }, [sizes])

  return { computeLayout, sizeVersion }
}
