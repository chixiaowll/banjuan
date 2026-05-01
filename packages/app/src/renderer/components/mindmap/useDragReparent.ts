import { useCallback, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useMindmapStore } from './useMindmapStore.js'

interface DragState {
  nodeId: string
  startX: number
  startY: number
  isDragging: boolean
}

export interface DropTarget {
  type: 'reparent' | 'reorder'
  targetId: string
  insertIndex?: number
}

export function useDragReparent() {
  const { rfNodes, reparentNode } = useMindmapStore()
  const { screenToFlowPosition } = useReactFlow()
  const dragRef = useRef<DragState | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  const isDescendant = useCallback((nodeId: string, potentialAncestorId: string): boolean => {
    const node = rfNodes.find(n => n.id === nodeId)
    if (!node) return false
    if (node.data.parentId === potentialAncestorId) return true
    if (node.data.parentId) return isDescendant(node.data.parentId, potentialAncestorId)
    return false
  }, [rfNodes])

  const onNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    const node = rfNodes.find(n => n.id === nodeId)
    if (!node || !node.data.parentId) return

    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, isDragging: false }
    holdTimerRef.current = setTimeout(() => {
      if (dragRef.current) {
        dragRef.current.isDragging = true
        setDraggingNodeId(nodeId)
      }
    }, 200)
  }, [rfNodes])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current?.isDragging) return

    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    let closestNode: string | null = null
    let closestDist = Infinity

    for (const n of rfNodes) {
      if (n.id === dragRef.current.nodeId) continue
      if (isDescendant(n.id, dragRef.current.nodeId)) continue
      const dx = (n.position.x + 80) - pos.x
      const dy = (n.position.y + 22) - pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist && dist < 100) {
        closestDist = dist
        closestNode = n.id
      }
    }

    if (closestNode) {
      setDropTarget({ type: 'reparent', targetId: closestNode })
    } else {
      setDropTarget(null)
    }
  }, [rfNodes, screenToFlowPosition, isDescendant])

  const onMouseUp = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)

    if (dragRef.current?.isDragging && dropTarget) {
      reparentNode(dragRef.current.nodeId, dropTarget.targetId, dropTarget.insertIndex)
    }

    dragRef.current = null
    setDraggingNodeId(null)
    setDropTarget(null)
  }, [dropTarget, reparentNode])

  return {
    draggingNodeId,
    dropTarget,
    onNodeMouseDown,
    onMouseMove,
    onMouseUp,
  }
}
