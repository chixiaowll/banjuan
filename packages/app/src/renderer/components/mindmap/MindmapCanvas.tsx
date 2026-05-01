import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow, MiniMap, Controls,
  useReactFlow, type OnNodesChange, type OnEdgesChange,
  applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes/index.js'
import { edgeTypes } from './edges/index.js'
import { useMindmapStore } from './useMindmapStore.js'
import { useLayoutEngine } from './useLayoutEngine.js'
import { getTheme } from './themes.js'
import './MindmapCanvas.css'

export default function MindmapCanvas() {
  const {
    rfNodes, rfEdges, layout, theme: themeName,
    setRfNodes, setRfEdges, selectNode, toggleSelectNode,
    setEditingNodeId,
  } = useMindmapStore()

  const { computeLayout } = useLayoutEngine()
  const { fitView } = useReactFlow()
  const theme = getTheme(themeName)
  const layoutRunRef = useRef(0)
  const isLayoutingRef = useRef(false)

  const structuralFingerprint = useMemo(
    () => rfNodes.map(n => `${n.id}-${n.data.collapsed}-${n.data.parentId}-${n.data.sortOrder}`).join(','),
    [rfNodes],
  )

  useEffect(() => {
    if (isLayoutingRef.current) return
    const run = ++layoutRunRef.current
    const doLayout = async () => {
      if (rfNodes.length === 0) return
      isLayoutingRef.current = true
      try {
        const result = await computeLayout(rfNodes, rfEdges, layout)
        if (run !== layoutRunRef.current) return
        setRfNodes(result.nodes)
        setRfEdges(result.edges)
        setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50)
      } finally {
        isLayoutingRef.current = false
      }
    }
    doLayout()
  }, [structuralFingerprint, layout])

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setRfNodes(applyNodeChanges(changes, rfNodes) as typeof rfNodes)
  }, [rfNodes, setRfNodes])

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setRfEdges(applyEdgeChanges(changes, rfEdges))
  }, [rfEdges, setRfEdges])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    if (_.metaKey || _.ctrlKey) {
      toggleSelectNode(node.id)
    } else {
      selectNode(node.id)
    }
  }, [selectNode, toggleSelectNode])

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: any) => {
    setEditingNodeId(node.id)
  }, [setEditingNodeId])

  const handlePaneClick = useCallback(() => {
    selectNode(null)
    setEditingNodeId(null)
  }, [selectNode, setEditingNodeId])

  return (
    <div className="mindmap-canvas" style={{ width: '100%', height: '100%', background: theme.canvas.background }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        fitView
        minZoom={0.1}
        maxZoom={3}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          style={{ background: theme.canvas.background }}
          maskColor="rgba(0,0,0,0.1)"
        />
        <Controls />
      </ReactFlow>
    </div>
  )
}
