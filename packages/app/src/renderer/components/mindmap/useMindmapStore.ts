import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

export interface MindmapNodeData {
  [key: string]: unknown
  id: string
  mindmapId: string
  parentId: string | null
  nodeType: string
  annotationId: string | null
  noteId: string | null
  docId: string | null
  hyperlink: string | null
  imageUrl: string | null
  tagId: string | null
  title: string
  content: string | null
  color: string | null
  notes: string | null
  shape: string | null
  styleOverrides: string | null
  sortOrder: number
  collapsed: boolean
  depth: number
}

interface HistoryEntry {
  rfNodes: Node<MindmapNodeData>[]
  rfEdges: Edge[]
}

interface MindmapState {
  mindmapId: string | null
  mindmapTitle: string
  layout: string
  theme: string

  rfNodes: Node<MindmapNodeData>[]
  rfEdges: Edge[]
  selectedNodeIds: string[]
  editingNodeId: string | null

  history: HistoryEntry[]
  historyIndex: number

  sidePanelType: 'none' | 'properties' | 'noteEditor' | 'theme'
  sidePanelNodeId: string | null

  init: (mindmapId: string) => Promise<void>
  setLayout: (layout: string) => void
  setTheme: (theme: string) => void
  setTitle: (title: string) => void
  setRfNodes: (nodes: Node<MindmapNodeData>[]) => void
  setRfEdges: (edges: Edge[]) => void
  selectNode: (id: string | null) => void
  selectNodes: (ids: string[]) => void
  toggleSelectNode: (id: string) => void
  setEditingNodeId: (id: string | null) => void

  addNode: (parentId: string | null, nodeType?: string) => Promise<string | null>
  addSiblingNode: (siblingId: string) => Promise<string | null>
  removeNode: (id: string) => Promise<void>
  updateNodeData: (id: string, updates: Record<string, unknown>) => Promise<void>
  reparentNode: (nodeId: string, newParentId: string | null, insertIndex?: number) => Promise<void>
  toggleCollapse: (id: string) => Promise<void>

  addRelationEdge: (sourceId: string, targetId: string, label?: string) => Promise<void>
  removeRelationEdge: (edgeId: string) => Promise<void>

  undo: () => void
  redo: () => void
  pushHistory: () => void

  openSidePanel: (type: 'properties' | 'noteEditor' | 'theme', nodeId?: string) => void
  closeSidePanel: () => void

  persist: () => Promise<void>
}

function buildTreeDepths(nodes: Node<MindmapNodeData>[]): Map<string, number> {
  const depths = new Map<string, number>()
  const childrenMap = new Map<string, string[]>()
  let rootId: string | null = null

  for (const n of nodes) {
    const parentId = n.data.parentId
    if (!parentId) {
      rootId = n.id
    } else {
      const siblings = childrenMap.get(parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(parentId, siblings)
    }
  }

  function walk(id: string, depth: number) {
    depths.set(id, depth)
    for (const childId of childrenMap.get(id) ?? []) {
      walk(childId, depth + 1)
    }
  }
  if (rootId) walk(rootId, 0)
  return depths
}

function apiNodesToRfNodes(apiNodes: any[], mindmapId: string): Node<MindmapNodeData>[] {
  const depths = new Map<string, number>()
  const childrenMap = new Map<string, string[]>()
  let rootId: string | null = null

  for (const n of apiNodes) {
    if (!n.parentId) rootId = n.id
    else {
      const siblings = childrenMap.get(n.parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(n.parentId, siblings)
    }
  }

  function walkDepth(id: string, d: number) {
    depths.set(id, d)
    for (const c of childrenMap.get(id) ?? []) walkDepth(c, d + 1)
  }
  if (rootId) walkDepth(rootId, 0)

  return apiNodes.map(n => ({
    id: n.id,
    type: n.nodeType ?? 'text',
    position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
    data: {
      id: n.id,
      mindmapId,
      parentId: n.parentId,
      nodeType: n.nodeType ?? 'text',
      annotationId: n.annotationId,
      noteId: n.noteId,
      docId: n.docId,
      hyperlink: n.hyperlink,
      imageUrl: n.imageUrl,
      tagId: n.tagId,
      title: n.title,
      content: n.content,
      color: n.color,
      notes: n.notes,
      shape: n.shape,
      styleOverrides: n.styleOverrides,
      sortOrder: n.sortOrder,
      collapsed: n.collapsed ?? false,
      depth: depths.get(n.id) ?? 0,
    },
  }))
}

function apiEdgesToRfEdges(treeNodes: Node<MindmapNodeData>[], apiEdges: any[]): Edge[] {
  const treeEdges: Edge[] = []
  for (const n of treeNodes) {
    if (n.data.parentId) {
      treeEdges.push({
        id: `tree-${n.data.parentId}-${n.id}`,
        source: n.data.parentId,
        target: n.id,
        type: 'treeEdge',
      })
    }
  }

  const relationEdges: Edge[] = apiEdges.map(e => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: 'relationEdge',
    data: { label: e.label },
  }))

  return [...treeEdges, ...relationEdges]
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

export const useMindmapStore = create<MindmapState>((set, get) => ({
  mindmapId: null,
  mindmapTitle: '',
  layout: 'mindmap',
  theme: 'classic',

  rfNodes: [],
  rfEdges: [],
  selectedNodeIds: [],
  editingNodeId: null,

  history: [],
  historyIndex: -1,

  sidePanelType: 'none',
  sidePanelNodeId: null,

  init: async (mindmapId: string) => {
    const mm = await window.electronAPI.mindmaps.get(mindmapId)
    if (!mm) return
    const [apiNodes, apiEdges] = await Promise.all([
      window.electronAPI.mindmaps.getNodes(mindmapId),
      window.electronAPI.mindmaps.getEdges(mindmapId),
    ])
    const rfNodes = apiNodesToRfNodes(apiNodes, mindmapId)
    const rfEdges = apiEdgesToRfEdges(rfNodes, apiEdges)
    set({
      mindmapId,
      mindmapTitle: mm.title,
      layout: mm.layout ?? 'mindmap',
      theme: mm.theme ?? 'classic',
      rfNodes,
      rfEdges,
      selectedNodeIds: [],
      editingNodeId: null,
      history: [{ rfNodes, rfEdges }],
      historyIndex: 0,
    })
  },

  setLayout: (layout) => {
    set({ layout })
    get().persist()
  },
  setTheme: (theme) => {
    set({ theme })
    get().persist()
  },
  setTitle: (title) => {
    set({ mindmapTitle: title })
    get().persist()
  },

  setRfNodes: (nodes) => set({ rfNodes: nodes }),
  setRfEdges: (edges) => set({ rfEdges: edges }),

  selectNode: (id) => set({ selectedNodeIds: id ? [id] : [] }),
  selectNodes: (ids) => set({ selectedNodeIds: ids }),
  toggleSelectNode: (id) => {
    const { selectedNodeIds } = get()
    if (selectedNodeIds.includes(id)) {
      set({ selectedNodeIds: selectedNodeIds.filter(i => i !== id) })
    } else {
      set({ selectedNodeIds: [...selectedNodeIds, id] })
    }
  },
  setEditingNodeId: (id) => set({ editingNodeId: id }),

  addNode: async (parentId, nodeType = 'text') => {
    const { mindmapId, rfNodes } = get()
    if (!mindmapId) return null
    const node = await window.electronAPI.mindmaps.addNode(mindmapId, {
      title: 'New Topic',
      parentId: parentId ?? undefined,
      nodeType,
    })
    const depths = buildTreeDepths(rfNodes)
    const parentDepth = parentId ? (depths.get(parentId) ?? 0) : -1
    const newRfNode: Node<MindmapNodeData> = {
      id: node.id,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: {
        id: node.id, mindmapId, parentId: node.parentId,
        nodeType: node.nodeType ?? nodeType,
        annotationId: null, noteId: null, docId: null,
        hyperlink: null, imageUrl: null, tagId: null,
        title: node.title, content: null, color: null,
        notes: null, shape: null, styleOverrides: null,
        sortOrder: node.sortOrder, collapsed: false,
        depth: parentDepth + 1,
      },
    }
    const updatedNodes = [...rfNodes, newRfNode]
    const treeEdges: Edge[] = []
    for (const n of updatedNodes) {
      if (n.data.parentId) {
        treeEdges.push({ id: `tree-${n.data.parentId}-${n.id}`, source: n.data.parentId, target: n.id, type: 'treeEdge' })
      }
    }
    const relationEdges = get().rfEdges.filter(e => e.type === 'relationEdge')
    set({ rfNodes: updatedNodes, rfEdges: [...treeEdges, ...relationEdges], editingNodeId: node.id })
    get().pushHistory()
    return node.id
  },

  addSiblingNode: async (siblingId) => {
    const sibling = get().rfNodes.find(n => n.id === siblingId)
    if (!sibling || !sibling.data.parentId) return null
    return get().addNode(sibling.data.parentId)
  },

  removeNode: async (id) => {
    const { rfNodes, rfEdges } = get()
    const descendantIds = new Set<string>()
    function collectDescendants(parentId: string) {
      for (const n of rfNodes) {
        if (n.data.parentId === parentId) {
          descendantIds.add(n.id)
          collectDescendants(n.id)
        }
      }
    }
    descendantIds.add(id)
    collectDescendants(id)
    await window.electronAPI.mindmaps.removeNode(id)
    set({
      rfNodes: rfNodes.filter(n => !descendantIds.has(n.id)),
      rfEdges: rfEdges.filter(e => !descendantIds.has(e.source) && !descendantIds.has(e.target)),
      selectedNodeIds: get().selectedNodeIds.filter(i => !descendantIds.has(i)),
    })
    get().pushHistory()
  },

  updateNodeData: async (id, updates) => {
    await window.electronAPI.mindmaps.updateNode(id, updates)
    set({
      rfNodes: get().rfNodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, ...updates } as MindmapNodeData } : n
      ),
    })
    get().pushHistory()
  },

  reparentNode: async (nodeId, newParentId, insertIndex) => {
    const { rfNodes } = get()
    const descendants = new Set<string>()
    function collect(pid: string) {
      for (const n of rfNodes) {
        if (n.data.parentId === pid) { descendants.add(n.id); collect(n.id) }
      }
    }
    collect(nodeId)
    if (newParentId && (descendants.has(newParentId) || nodeId === newParentId)) return

    await window.electronAPI.mindmaps.updateNode(nodeId, { parentId: newParentId ?? undefined })
    if (insertIndex !== undefined) {
      await window.electronAPI.mindmaps.updateNode(nodeId, { sortOrder: insertIndex })
    }

    const updatedNodes = rfNodes.map(n => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, parentId: newParentId, sortOrder: insertIndex ?? n.data.sortOrder } }
      }
      return n
    })

    const recalcDepths = buildTreeDepths(updatedNodes)
    const withDepths = updatedNodes.map(n => ({
      ...n, data: { ...n.data, depth: recalcDepths.get(n.id) ?? 0 },
    }))

    const treeEdges: Edge[] = []
    for (const n of withDepths) {
      if (n.data.parentId) {
        treeEdges.push({ id: `tree-${n.data.parentId}-${n.id}`, source: n.data.parentId, target: n.id, type: 'treeEdge' })
      }
    }
    const relationEdges = get().rfEdges.filter(e => e.type === 'relationEdge')
    set({ rfNodes: withDepths, rfEdges: [...treeEdges, ...relationEdges] })
    get().pushHistory()
  },

  toggleCollapse: async (id) => {
    const node = get().rfNodes.find(n => n.id === id)
    if (!node) return
    const newCollapsed = !node.data.collapsed
    await window.electronAPI.mindmaps.updateNode(id, { collapsed: newCollapsed })
    set({
      rfNodes: get().rfNodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, collapsed: newCollapsed } } : n
      ),
    })
  },

  addRelationEdge: async (sourceId, targetId, label) => {
    const { mindmapId } = get()
    if (!mindmapId) return
    const edge = await window.electronAPI.mindmaps.addEdge(mindmapId, { sourceId, targetId, label })
    set({
      rfEdges: [...get().rfEdges, { id: edge.id, source: sourceId, target: targetId, type: 'relationEdge', data: { label } }],
    })
    get().pushHistory()
  },

  removeRelationEdge: async (edgeId) => {
    await window.electronAPI.mindmaps.removeEdge(edgeId)
    set({ rfEdges: get().rfEdges.filter(e => e.id !== edgeId) })
    get().pushHistory()
  },

  pushHistory: () => {
    const { rfNodes, rfEdges, history, historyIndex } = get()
    const trimmed = history.slice(0, historyIndex + 1)
    const newHistory = [...trimmed, { rfNodes, rfEdges }]
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    set({ rfNodes: prev.rfNodes, rfEdges: prev.rfEdges, historyIndex: historyIndex - 1 })
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    set({ rfNodes: next.rfNodes, rfEdges: next.rfEdges, historyIndex: historyIndex + 1 })
  },

  openSidePanel: (type, nodeId) => set({ sidePanelType: type, sidePanelNodeId: nodeId ?? null }),
  closeSidePanel: () => set({ sidePanelType: 'none', sidePanelNodeId: null }),

  persist: async () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(async () => {
      const { mindmapId, mindmapTitle, layout, theme } = get()
      if (!mindmapId) return
      await window.electronAPI.mindmaps.update(mindmapId, { title: mindmapTitle, layout, theme })
    }, 500)
  },
}))
