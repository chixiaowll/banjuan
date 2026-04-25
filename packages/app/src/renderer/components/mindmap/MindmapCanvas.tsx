import React, { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import MindmapNodeComponent from './MindmapNode.js'

interface NodeData {
  id: string
  parentId: string | null
  title: string
  content: string | null
  color: string | null
  collapsed: boolean
}

interface EdgeData {
  id: string
  sourceId: string
  targetId: string
  label: string | null
}

interface Props {
  nodes: NodeData[]
  edges: EdgeData[]
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onDoubleClickNode: (id: string) => void
  onToggleCollapse: (id: string) => void
}

interface LayoutNode {
  id: string; title: string; color: string | null; collapsed: boolean
  x: number; y: number; hasChildren: boolean
}

interface LayoutLink {
  sourceX: number; sourceY: number; targetX: number; targetY: number
}

export default function MindmapCanvas({
  nodes, edges, selectedNodeId, onSelectNode, onDoubleClickNode, onToggleCollapse,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k })
      })
    svg.call(zoom)
    const width = svgRef.current.clientWidth
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 60))
    return () => { svg.on('.zoom', null) }
  }, [])

  const { layoutNodes, layoutLinks } = useMemo(() => {
    if (nodes.length === 0) return { layoutNodes: [] as LayoutNode[], layoutLinks: [] as LayoutLink[] }

    const roots = nodes.filter(n => n.parentId === null)
    if (roots.length === 0) return { layoutNodes: [] as LayoutNode[], layoutLinks: [] as LayoutLink[] }

    const buildChildren = (parentId: string): any[] => {
      const parent = nodes.find(n => n.id === parentId)
      if (parent?.collapsed) return []
      return nodes
        .filter(n => n.parentId === parentId)
        .map(n => ({ ...n, children: buildChildren(n.id) }))
    }

    const rootData = { ...roots[0], children: buildChildren(roots[0].id) }
    const hierarchy = d3.hierarchy(rootData)
    const treeLayout = d3.tree<any>().nodeSize([160, 80])
    treeLayout(hierarchy)

    const lNodes: LayoutNode[] = hierarchy.descendants().map((d: any) => ({
      id: d.data.id, title: d.data.title, color: d.data.color,
      collapsed: d.data.collapsed, x: d.x, y: d.y,
      hasChildren: nodes.some(n => n.parentId === d.data.id),
    }))

    const lLinks: LayoutLink[] = hierarchy.links().map((link: any) => ({
      sourceX: link.source.x, sourceY: link.source.y + 18,
      targetX: link.target.x, targetY: link.target.y - 18,
    }))

    return { layoutNodes: lNodes, layoutLinks: lLinks }
  }, [nodes])

  const crossEdgeLines = useMemo(() => {
    const pos = new Map(layoutNodes.map(n => [n.id, { x: n.x, y: n.y }]))
    return edges.filter(e => pos.has(e.sourceId) && pos.has(e.targetId)).map(e => ({
      ...e, sourceX: pos.get(e.sourceId)!.x, sourceY: pos.get(e.sourceId)!.y,
      targetX: pos.get(e.targetId)!.x, targetY: pos.get(e.targetId)!.y,
    }))
  }, [edges, layoutNodes])

  return (
    <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'var(--bg, #1e1e2e)' }}
      onClick={() => onSelectNode(null)}>
      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
        {layoutLinks.map((link, i) => (
          <path key={`link-${i}`}
            d={`M${link.sourceX},${link.sourceY} C${link.sourceX},${(link.sourceY + link.targetY) / 2} ${link.targetX},${(link.sourceY + link.targetY) / 2} ${link.targetX},${link.targetY}`}
            fill="none" stroke="var(--border, #45475a)" strokeWidth={1.5} />
        ))}
        {crossEdgeLines.map((e) => (
          <line key={`edge-${e.id}`} x1={e.sourceX} y1={e.sourceY} x2={e.targetX} y2={e.targetY}
            stroke="#89b4fa" strokeWidth={1} strokeDasharray="4,4" opacity={0.6} />
        ))}
        {layoutNodes.map((node) => (
          <MindmapNodeComponent key={node.id} id={node.id} title={node.title} color={node.color}
            x={node.x} y={node.y} isSelected={node.id === selectedNodeId}
            collapsed={node.collapsed} hasChildren={node.hasChildren}
            onSelect={onSelectNode} onDoubleClick={onDoubleClickNode} onToggleCollapse={onToggleCollapse} />
        ))}
      </g>
    </svg>
  )
}
