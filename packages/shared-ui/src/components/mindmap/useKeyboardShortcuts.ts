import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useBanjuanAPI } from '../../api.js'
import { useMindmapStore, useMindmapStoreApi } from './useMindmapStore.js'
import { parseTextToBlocks } from './parseMarkdownBlocks.js'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'])
const ATTACHMENT_PREFIX = 'banjuan-attachment://'

export function useKeyboardShortcuts() {
  const api = useBanjuanAPI()
  const {
    rfNodes, selectedNodeIds, editingNodeId,
    addNode, addSiblingNode, removeNode, selectNode,
    setEditingNodeId, toggleCollapse, undo, redo, openSidePanel,
  } = useMindmapStore()
  const storeApi = useMindmapStoreApi()
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  useEffect(() => {
    function isEditable(el: HTMLElement | null): boolean {
      while (el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true
        el = el.parentElement
      }
      return false
    }

    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return
      if (isEditable(e.target as HTMLElement)) return

      const selected = selectedNodeIds[0]
      const meta = e.metaKey || e.ctrlKey

      if (e.key === 'Tab' && selected) {
        e.preventDefault()
        addNode(selected)
        return
      }

      if (e.key === 'Enter' && !e.shiftKey && selected) {
        e.preventDefault()
        openSidePanel('contentEditor', selected)
        return
      }

      if (e.key === 'Enter' && e.shiftKey && selected) {
        e.preventDefault()
        addSiblingNode(selected)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        const node = rfNodes.find(n => n.id === selected)
        if (node?.data.parentId || node?.data.floating) removeNode(selected)
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

    async function handlePaste(e: ClipboardEvent) {
      if (editingNodeId) return
      if (isEditable(e.target as HTMLElement)) return

      const { rfNodes: nodes, mindmapId, selectedNodeIds: selIds, addNode: add, updateNodeData } = storeApi.getState()
      if (!mindmapId) return

      const selected = selIds[0]
      const parentId = selected ?? nodes.find(n => !n.data.parentId && !n.data.floating)?.id ?? null

      const clipData = e.clipboardData
      if (!clipData) return

      const imageFile = Array.from(clipData.files).find(f => IMAGE_TYPES.has(f.type))
      if (imageFile) {
        e.preventDefault()
        const targetNodeId = selected
        if (!targetNodeId) return
        const buffer = await imageFile.arrayBuffer()
        const relativePath = await api.attachments.save(mindmapId, imageFile.name, buffer)
        const url = `${ATTACHMENT_PREFIX}${relativePath}`
        const node = nodes.find(n => n.id === targetNodeId)
        let existingBlocks: any[] = []
        try {
          if (node?.data.content) existingBlocks = JSON.parse(node.data.content as string)
          if (!Array.isArray(existingBlocks)) existingBlocks = []
        } catch { existingBlocks = [] }
        const imageBlock = { type: 'image', props: { url }, children: [] }
        const newContent = JSON.stringify([...existingBlocks, imageBlock])
        await updateNodeData(targetNodeId, { content: newContent })
        return
      }

      const text = clipData.getData('text/plain')?.trim()
      if (text) {
        e.preventDefault()
        const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
        const isShort = lines.length <= 3 && text.length <= 100

        if (isShort) {
          for (const line of lines) {
            const newId = await add(parentId)
            if (newId) {
              await storeApi.getState().updateNodeData(newId, { title: line })
            }
          }
        } else {
          const targetNodeId = selected
          if (!targetNodeId) return
          const node = nodes.find(n => n.id === targetNodeId)
          const existing = (node?.data.content as string) ?? ''
          const hasExisting = (() => { try { const b = JSON.parse(existing); return Array.isArray(b) && b.length > 0 } catch { return false } })()
          if (hasExisting) {
            const existingBlocks = JSON.parse(existing)
            const newBlocks = parseTextToBlocks(text)
            await updateNodeData(targetNodeId, { content: JSON.stringify([...existingBlocks, ...newBlocks]) })
          } else {
            await updateNodeData(targetNodeId, { content: text })
          }
        }
      }
    }

    document.addEventListener('keydown', handler)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('paste', handlePaste)
    }
  }, [rfNodes, selectedNodeIds, editingNodeId, addNode, addSiblingNode, removeNode, selectNode, setEditingNodeId, toggleCollapse, undo, redo, openSidePanel, fitView, zoomIn, zoomOut, storeApi])
}
