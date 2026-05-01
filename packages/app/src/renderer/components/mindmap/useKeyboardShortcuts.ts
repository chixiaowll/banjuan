import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useMindmapStore } from './useMindmapStore.js'

export function useKeyboardShortcuts() {
  const {
    rfNodes, selectedNodeIds, editingNodeId,
    addNode, addSiblingNode, removeNode, selectNode,
    setEditingNodeId, toggleCollapse, undo, redo,
  } = useMindmapStore()
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const selected = selectedNodeIds[0]
      const meta = e.metaKey || e.ctrlKey

      if (e.key === 'Tab' && selected) {
        e.preventDefault()
        addNode(selected)
        return
      }

      if (e.key === 'Enter' && selected) {
        e.preventDefault()
        addSiblingNode(selected)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        const node = rfNodes.find(n => n.id === selected)
        if (node?.data.parentId) removeNode(selected)
        return
      }

      if ((e.key === ' ' || e.key === 'F2') && selected) {
        e.preventDefault()
        setEditingNodeId(selected)
        return
      }

      if (e.key === '/' && selected) {
        e.preventDefault()
        toggleCollapse(selected)
        return
      }

      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      if (meta && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }

      if (meta && e.key === '0') {
        e.preventDefault()
        fitView({ duration: 300, padding: 0.2 })
        return
      }

      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn({ duration: 200 })
        return
      }

      if (meta && e.key === '-') {
        e.preventDefault()
        zoomOut({ duration: 200 })
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selected) {
        e.preventDefault()
        navigateNode(e.key, selected)
        return
      }
    }

    function navigateNode(key: string, currentId: string) {
      const current = rfNodes.find(n => n.id === currentId)
      if (!current) return

      const siblings = rfNodes
        .filter(n => n.data.parentId === current.data.parentId)
        .sort((a, b) => a.data.sortOrder - b.data.sortOrder)

      const currentIndex = siblings.findIndex(n => n.id === currentId)

      let targetId: string | null = null

      switch (key) {
        case 'ArrowUp':
          if (currentIndex > 0) targetId = siblings[currentIndex - 1].id
          break
        case 'ArrowDown':
          if (currentIndex < siblings.length - 1) targetId = siblings[currentIndex + 1].id
          break
        case 'ArrowLeft':
          if (current.data.parentId) targetId = current.data.parentId
          break
        case 'ArrowRight': {
          const children = rfNodes
            .filter(n => n.data.parentId === currentId)
            .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
          if (children.length > 0) targetId = children[0].id
          break
        }
      }

      if (targetId) selectNode(targetId)
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [rfNodes, selectedNodeIds, editingNodeId, addNode, addSiblingNode, removeNode, selectNode, setEditingNodeId, toggleCollapse, undo, redo, fitView, zoomIn, zoomOut])
}
