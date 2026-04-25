import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface GraphNode {
  id: string
  label: string
  type: 'document' | 'note' | 'mindmap'
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick: (id: string, type: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  document: '#89b4fa',
  note: '#a6e3a1',
  mindmap: '#cba6f7',
}

export default function KnowledgeGraph({ nodes, edges, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll('*').remove()

    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2))

    const nodeData: GraphNode[] = nodes.map(n => ({ ...n }))
    const edgeData: GraphEdge[] = edges.map(e => ({ ...e }))

    const simulation = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edgeData).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(40))

    const link = g.append('g')
      .selectAll('line')
      .data(edgeData)
      .join('line')
      .attr('stroke', '#585b70')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)

    const node = g.append('g')
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d.id, d.type))
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }) as any
      )

    node.append('circle')
      .attr('r', 12)
      .attr('fill', d => TYPE_COLORS[d.type] ?? '#cdd6f4')
      .attr('stroke', '#313244')
      .attr('stroke-width', 1.5)

    node.append('text')
      .text(d => d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label)
      .attr('dy', 24)
      .attr('text-anchor', 'middle')
      .attr('fill', '#a6adc8')
      .attr('font-size', 11)

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
      svg.on('.zoom', null)
    }
  }, [nodes, edges, onNodeClick])

  return <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'var(--bg, #1e1e2e)' }} />
}
