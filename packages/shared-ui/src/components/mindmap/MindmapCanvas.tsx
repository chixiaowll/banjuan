import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, MiniMap, Controls, Panel,
  useReactFlow, type OnNodesChange, type OnEdgesChange,
  applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes/index.js'
import { edgeTypes } from './edges/index.js'
import { useMindmapStore, useMindmapStoreApi } from './useMindmapStore.js'
import { useLayoutEngine } from './useLayoutEngine.js'
import { getTheme } from './themes.js'
import ViewportOverlay from './overlays/ViewportOverlay.js'
import BoundaryOverlay from './overlays/BoundaryOverlay.js'
import SummaryOverlay from './overlays/SummaryOverlay.js'
import './MindmapCanvas.css'

export default function MindmapCanvas({ readonly = false }: { readonly?: boolean } = {}) {
  const [miniMapOpen, setMiniMapOpen] = useState(true)
  const {
    rfNodes, rfEdges, layout, theme: themeName,
    setRfNodes, setRfEdges, selectNode, toggleSelectNode,
    setEditingNodeId, openSidePanel, updateNodeData,
    reparentNode, reorderSiblings, setDropTarget,
    connectMode, connectSourceId, setConnectSourceId, addRelationEdge, setConnectMode,
  } = useMindmapStore()

  const storeApi = useMindmapStoreApi()
  const { computeLayout, sizeVersion } = useLayoutEngine()
  const { fitView } = useReactFlow()
  const theme = getTheme(themeName)
  const hasInitialLayoutRef = useRef(false)
  const dragStartRef = useRef<{ nodeId: string; positions: Map<string, { x: number; y: number }> } | null>(null)

  const structuralFingerprint = useMemo(
    () => rfNodes.map(n => `${n.id}-${n.data.collapsed}-${n.data.parentId}-${n.data.sortOrder}-${n.data.content ? n.data.content.length : 0}-${n.data.floating ? 'f' : ''}`).join(','),
    [rfNodes],
  )

  useEffect(() => {
    if (rfNodes.length === 0) return
    const result = computeLayout(rfNodes, rfEdges, layout, storeApi.getState().summaries)
    const posMap = new Map(result.nodes.map(n => [n.id, n]))
    const merged = rfNodes.map(n => {
      const layouted = posMap.get(n.id)
      if (!layouted) return n
      const changed = n.position.x !== layouted.position.x || n.position.y !== layouted.position.y
        || n.hidden !== layouted.hidden || n.width !== layouted.width || n.height !== layouted.height
        || n.draggable !== layouted.draggable
      if (changed) {
        return { ...n, position: layouted.position, hidden: layouted.hidden, width: layouted.width, height: layouted.height, draggable: layouted.draggable }
      }
      return n
    })
    setRfNodes(merged)
    setRfEdges(result.edges)
    if (!hasInitialLayoutRef.current && sizeVersion > 0) {
      hasInitialLayoutRef.current = true
      setTimeout(() => fitView({ duration: 300, padding: 0.2, maxZoom: 1 }), 50)
    }
  }, [structuralFingerprint, layout, sizeVersion])

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    const s = storeApi.getState()
    s.setRfNodes(applyNodeChanges(changes, s.rfNodes) as typeof s.rfNodes)
  }, [storeApi])

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    const s = storeApi.getState()
    s.setRfEdges(applyEdgeChanges(changes, s.rfEdges))
  }, [storeApi])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    if (connectMode) {
      if (!connectSourceId) {
        setConnectSourceId(node.id)
      } else if (node.id !== connectSourceId) {
        addRelationEdge(connectSourceId, node.id, '')
        setConnectSourceId(null)
        setConnectMode(false)
      }
      return
    }
    if (_.metaKey || _.ctrlKey) {
      toggleSelectNode(node.id)
    } else {
      selectNode(node.id)
      openSidePanel('contentEditor', node.id)
    }
  }, [connectMode, connectSourceId, selectNode, toggleSelectNode, openSidePanel, setConnectSourceId, addRelationEdge, setConnectMode])

  const handlePaneClick = useCallback(() => {
    if (connectMode) {
      setConnectMode(false)
      return
    }
    selectNode(null)
    setEditingNodeId(null)
  }, [connectMode, setConnectMode, selectNode, setEditingNodeId])

  const onNodeDragStart = useCallback((_event: any, node: any) => {
    const positions = new Map<string, { x: number; y: number }>()
    for (const n of storeApi.getState().rfNodes) {
      positions.set(n.id, { ...n.position })
    }
    dragStartRef.current = { nodeId: node.id, positions }
  }, [storeApi])

  const getDescendantIds = useCallback((nodeId: string, nodes: typeof rfNodes) => {
    const ids = new Set<string>()
    const collect = (pid: string) => {
      for (const n of nodes) {
        if (n.data.parentId === pid) { ids.add(n.id); collect(n.id) }
      }
    }
    collect(nodeId)
    return ids
  }, [])

  const findDropTarget = useCallback((draggedNode: any): { nodeId: string; position: 'inside' | 'before' | 'after' } | null => {
    const { rfNodes: currentNodes } = storeApi.getState()
    const descendants = getDescendantIds(draggedNode.id, currentNodes)
    const dragCx = draggedNode.position.x
    const dragCy = draggedNode.position.y

    let closest: { nodeId: string; dist: number; position: 'inside' | 'before' | 'after' } | null = null
    const THRESHOLD = 80

    for (const n of currentNodes) {
      if (n.id === draggedNode.id || descendants.has(n.id) || n.hidden) continue
      const nw = n.width ?? 160
      const nh = n.height ?? 40
      const ncx = n.position.x + nw / 2
      const ncy = n.position.y + nh / 2

      const dx = dragCx - ncx
      const dy = dragCy - ncy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > THRESHOLD * 3) continue

      // Right side of node = drop as child (inside)
      const rightEdgeX = n.position.x + nw
      const distToRight = Math.abs(dragCx - rightEdgeX - 40)
      const distToNodeY = Math.abs(dragCy - ncy)
      if (distToRight < THRESHOLD && distToNodeY < nh) {
        if (!closest || distToRight < closest.dist) {
          closest = { nodeId: n.id, dist: distToRight, position: 'inside' }
        }
        continue
      }

      // Same parent — reorder before/after
      if (n.data.parentId && n.data.parentId === draggedNode.data.parentId) {
        const vertDist = Math.abs(dragCy - ncy)
        if (vertDist < nh + 20 && Math.abs(dragCx - ncx) < nw) {
          const pos = dragCy < ncy ? 'before' : 'after'
          if (!closest || vertDist < closest.dist) {
            closest = { nodeId: n.id, dist: vertDist, position: pos }
          }
        }
      }
    }

    return closest ? { nodeId: closest.nodeId, position: closest.position } : null
  }, [storeApi, getDescendantIds])

  const onNodeDrag = useCallback((_event: any, node: any) => {
    const start = dragStartRef.current
    if (!start) return

    const isRoot = !node.data.parentId && !node.data.floating
    const isFloatingRoot = node.data.floating && !node.data.parentId
    const isChild = !!node.data.parentId && !node.data.floating

    if (isChild) {
      // Child drag: move descendants and detect drop target
      const { rfNodes: currentNodes, setRfNodes: setNodes } = storeApi.getState()
      const descendants = getDescendantIds(node.id, currentNodes)
      const origPos = start.positions.get(node.id)
      if (origPos) {
        const dx = node.position.x - origPos.x
        const dy = node.position.y - origPos.y
        setNodes(currentNodes.map(n => {
          if (n.id === node.id) return n
          if (!descendants.has(n.id)) return n
          const orig = start.positions.get(n.id)
          if (!orig) return n
          return { ...n, position: { x: orig.x + dx, y: orig.y + dy } }
        }))
      }
      const target = findDropTarget(node)
      setDropTarget(target)
      return
    }

    if (!isRoot && !isFloatingRoot) return

    const origPos = start.positions.get(node.id)
    if (!origPos) return
    const dx = node.position.x - origPos.x
    const dy = node.position.y - origPos.y

    const { rfNodes: currentNodes, setRfNodes: setNodes } = storeApi.getState()

    if (isRoot) {
      setNodes(currentNodes.map(n => {
        if (n.id === node.id) return n
        const orig = start.positions.get(n.id)
        if (!orig) return n
        return { ...n, position: { x: orig.x + dx, y: orig.y + dy } }
      }))
    } else {
      const descendantIds = getDescendantIds(node.id, currentNodes)
      setNodes(currentNodes.map(n => {
        if (n.id === node.id) return n
        if (!descendantIds.has(n.id)) return n
        const orig = start.positions.get(n.id)
        if (!orig) return n
        return { ...n, position: { x: orig.x + dx, y: orig.y + dy } }
      }))
    }
  }, [storeApi, getDescendantIds, findDropTarget, setDropTarget])

  const onNodeDragStop = useCallback(async (_event: any, node: any) => {
    const start = dragStartRef.current
    const isRoot = !node.data.parentId && !node.data.floating
    const isFloatingRoot = node.data.floating && !node.data.parentId
    const isChild = !!node.data.parentId && !node.data.floating

    if (isChild) {
      const target = storeApi.getState().dropTarget
      setDropTarget(null)

      if (target) {
        dragStartRef.current = null
        if (target.position === 'inside') {
          const targetChildren = storeApi.getState().rfNodes
            .filter(n => n.data.parentId === target.nodeId)
          await reparentNode(node.id, target.nodeId, targetChildren.length)
        } else {
          const siblings = storeApi.getState().rfNodes
            .filter(n => n.data.parentId === node.data.parentId && n.id !== node.id)
            .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
          const targetIdx = siblings.findIndex(n => n.id === target.nodeId)
          if (targetIdx >= 0) {
            const newIdx = target.position === 'before' ? targetIdx : targetIdx + 1
            await reorderSiblings(node.id, newIdx)
          }
        }
      } else if (start) {
        const { rfNodes: currentNodes, setRfNodes: setNodes } = storeApi.getState()
        setNodes(currentNodes.map(n => {
          const orig = start.positions.get(n.id)
          if (!orig) return n
          return { ...n, position: orig }
        }))
        dragStartRef.current = null
      }
      return
    }

    if (isRoot && start) {
      const origPos = start.positions.get(node.id)
      if (origPos) {
        const prevX = node.data.positionX ?? 0
        const prevY = node.data.positionY ?? 0
        const dx = node.position.x - origPos.x
        const dy = node.position.y - origPos.y
        storeApi.getState().updateNodeData(node.id, { positionX: prevX + dx, positionY: prevY + dy })
      }
    }

    if (isFloatingRoot) {
      const { rfNodes: currentNodes } = storeApi.getState()
      const rootNode = currentNodes.find(n => !n.data.parentId && !n.data.floating)
      const rootX = rootNode?.position.x ?? 0
      const rootY = rootNode?.position.y ?? 0
      storeApi.getState().updateNodeData(node.id, { positionX: node.position.x - rootX, positionY: node.position.y - rootY })
    }

    dragStartRef.current = null
  }, [storeApi, reparentNode, reorderSiblings, setDropTarget])

  return (
    <div className="mindmap-canvas" style={{ width: '100%', height: '100%', background: theme.canvas.background, cursor: connectMode ? 'crosshair' : undefined }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={readonly ? undefined : handleNodeClick}
        onPaneClick={readonly ? undefined : handlePaneClick}
        onNodeDragStart={readonly ? undefined : onNodeDragStart}
        onNodeDrag={readonly ? undefined : onNodeDrag}
        onNodeDragStop={readonly ? undefined : onNodeDragStop}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        nodesDraggable={!readonly}
        nodesConnectable={false}
        elementsSelectable={!readonly}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        {!readonly && (
          <>
            {miniMapOpen && (
              <MiniMap
                style={{ background: theme.canvas.background }}
                maskColor="rgba(0,0,0,0.1)"
              />
            )}
            <Panel position="bottom-right" style={{ margin: miniMapOpen ? '0 10px 10px 0' : '0 10px 10px 0' }}>
              <button
                onClick={() => setMiniMapOpen(v => !v)}
                style={{
                  fontSize: 11, padding: '3px 8px',
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid var(--border, #e0e0e0)',
                  borderRadius: 4, cursor: 'pointer',
                  color: 'var(--text-muted, #666)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {miniMapOpen ? '▼ 隐藏导航' : '▲ 显示导航'}
              </button>
            </Panel>
            <Controls />
          </>
        )}
      </ReactFlow>
      <ViewportOverlay>
        <BoundaryOverlay />
        <SummaryOverlay />
      </ViewportOverlay>
    </div>
  )
}
