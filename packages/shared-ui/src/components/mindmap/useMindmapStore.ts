import { createStore, useStore, type StoreApi } from 'zustand'
import { createContext, useContext, useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { useNodeSizeStore } from './useNodeSizeStore.js'
import { layoutMindmap } from './useLayoutEngine.js'
import type { BanjuanAPI } from '../../api.js'
import type { MindmapSnapshot } from '@banjuan/core'
import { toast, errorMessage } from '../feedback.js'
import { announceNoteChanged, useNoteChangedElsewhere } from '../../utils/noteChanges.js'
import { useT } from '../../i18n/index.js'


/** This map's measured node sizes, as one comparable string. */
export function sizeKeyOf(nodes: Array<{ id: string }>): string {
  const sizes = useNodeSizeStore.getState().sizes
  return nodes.map(n => {
    const s = sizes.get(n.id)
    return s ? `${n.id}:${s.width}x${s.height}` : n.id
  }).join('|')
}

export interface MindmapNodeData {
  [key: string]: unknown
  id: string
  mindmapId: string
  parentId: string | null
  title: string
  content: string | null
  hyperlink: string | null
  imageUrl: string | null
  color: string | null
  notes: string | null
  shape: string | null
  styleOverrides: string | null
  positionX: number | null
  positionY: number | null
  sortOrder: number
  collapsed: boolean
  floating: boolean
  depth: number
}

interface HistoryEntry {
  rfNodes: Node<MindmapNodeData>[]
  rfEdges: Edge[]
}

export interface MindmapState {
  mindmapId: string | null
  mindmapTitle: string
  layout: string
  /** The user picked the layout (see init: an unpicked 'mindmap' shows as it always has, 'logical'). */
  layoutChosen: boolean
  /** The title was edited in this canvas and not saved yet — only then does persist() send it. */
  titleDirty: boolean
  theme: string
  /** sizeKeyOf(rfNodes) as last loaded or saved: node sizes are saved only when this map's change. */
  savedSizeKey: string

  rfNodes: Node<MindmapNodeData>[]
  rfEdges: Edge[]
  selectedNodeIds: string[]
  editingNodeId: string | null

  history: HistoryEntry[]
  historyIndex: number

  dropTarget: { nodeId: string; position: 'inside' | 'before' | 'after' } | null

  connectMode: boolean
  connectSourceId: string | null

  boundaries: Array<{ id: string; nodeIds: string[]; label: string; color: string | null }>
  summaries: Array<{ id: string; nodeIds: string[]; summaryNodeId: string }>

  sidePanelType: 'none' | 'properties' | 'contentEditor' | 'theme'
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

  addNode: (parentId: string | null) => Promise<string | null>
  addFloatingNode: () => Promise<string | null>
  addSiblingNode: (siblingId: string) => Promise<string | null>
  removeNode: (id: string) => Promise<void>
  updateNodeData: (id: string, updates: Record<string, unknown>) => Promise<void>
  reparentNode: (nodeId: string, newParentId: string | null, insertIndex?: number) => Promise<void>
  reorderSiblings: (nodeId: string, newIndex: number) => Promise<void>
  setDropTarget: (target: { nodeId: string; position: 'inside' | 'before' | 'after' } | null) => void
  toggleCollapse: (id: string) => Promise<void>

  addRelationEdge: (sourceId: string, targetId: string, label?: string) => Promise<void>
  updateRelationEdge: (edgeId: string, updates: { label?: string; style?: string }) => Promise<void>
  removeRelationEdge: (edgeId: string) => Promise<void>
  setConnectMode: (on: boolean) => void
  setConnectSourceId: (id: string | null) => void

  addBoundary: (nodeIds: string[], label?: string) => Promise<void>
  updateBoundary: (id: string, updates: { label?: string; color?: string }) => Promise<void>
  removeBoundary: (id: string) => Promise<void>

  addSummary: (nodeIds: string[]) => Promise<void>
  removeSummary: (id: string) => Promise<void>

  undo: () => void
  redo: () => void
  pushHistory: () => void

  openSidePanel: (type: 'properties' | 'contentEditor' | 'theme', nodeId?: string) => void
  closeSidePanel: () => void

  persist: () => Promise<void>
  /** Write a pending persist() now (before the window closes / app quits). */
  flushPersist: () => Promise<void>

  /** Identifies this canvas's own writes in note-change announcements (utils/noteChanges.ts). */
  changeSource: object
  /** The map changed elsewhere (another editor, a sync): reload it, unless edits here are still being written. */
  reloadIfChanged: () => Promise<void>
}

function buildTreeDepths(nodes: Node<MindmapNodeData>[]): Map<string, number> {
  const depths = new Map<string, number>()
  const childrenMap = new Map<string, string[]>()

  for (const n of nodes) {
    const parentId = n.data.parentId
    if (parentId) {
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

  for (const n of nodes) {
    if (!n.data.parentId) walk(n.id, 0)
  }
  return depths
}

function apiNodesToRfNodes(apiNodes: any[], mindmapId: string): Node<MindmapNodeData>[] {
  const depths = new Map<string, number>()
  const childrenMap = new Map<string, string[]>()

  for (const n of apiNodes) {
    if (n.parentId) {
      const siblings = childrenMap.get(n.parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(n.parentId, siblings)
    }
  }

  function walkDepth(id: string, d: number) {
    depths.set(id, d)
    for (const c of childrenMap.get(id) ?? []) walkDepth(c, d + 1)
  }

  for (const n of apiNodes) {
    if (!n.parentId) walkDepth(n.id, 0)
  }

  return apiNodes.map(n => ({
    id: n.id,
    type: 'default',
    position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
    draggable: true,
    data: {
      id: n.id,
      mindmapId,
      parentId: n.parentId,
      title: n.title,
      content: n.content,
      hyperlink: n.hyperlink,
      imageUrl: n.imageUrl,
      color: n.color,
      notes: n.notes,
      shape: n.shape,
      styleOverrides: n.styleOverrides,
      positionX: n.positionX ?? null,
      positionY: n.positionY ?? null,
      sortOrder: n.sortOrder,
      collapsed: n.collapsed ?? false,
      floating: n.floating ?? false,
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
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
      })
    }
  }

  const relationEdges: Edge[] = apiEdges.map(e => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: 'relationEdge',
    data: { label: e.label, style: e.style },
  }))

  return [...treeEdges, ...relationEdges]
}

/** The canvas state as stored nodes + relation edges (tree edges follow from parentId). */
function toSnapshot(rfNodes: Node<MindmapNodeData>[], rfEdges: Edge[]): MindmapSnapshot {
  return {
    nodes: rfNodes.map(({ data: d }) => ({
      id: d.id, parentId: d.parentId, title: d.title, content: d.content,
      hyperlink: d.hyperlink, imageUrl: d.imageUrl, color: d.color, notes: d.notes,
      shape: d.shape, styleOverrides: d.styleOverrides, positionX: d.positionX, positionY: d.positionY,
      sortOrder: d.sortOrder, collapsed: d.collapsed, floating: d.floating,
    })),
    edges: rfEdges.filter(e => e.type === 'relationEdge').map(e => ({
      id: e.id, sourceId: e.source, targetId: e.target,
      label: ((e.data as any)?.label as string | null) ?? null, style: ((e.data as any)?.style as string | null) ?? null,
    })),
  }
}

/** A copy of `target` whose methods (own or inherited, bound to `target`) pass through `wrap`. */
function wrapMethods<T extends object>(target: T, wrap: (name: string, fn: (...args: any[]) => any) => (...args: any[]) => any): T {
  const out: Record<string, unknown> = {}
  for (let o: object | null = target; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const name of Object.getOwnPropertyNames(o)) {
      if (name === 'constructor' || name in out) continue
      const value = (target as any)[name]
      out[name] = typeof value === 'function' ? wrap(name, value.bind(target)) : value
    }
  }
  return out as T
}

/** Order-independent comparison key for a snapshot. */
function snapshotKey(s: MindmapSnapshot): string {
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return JSON.stringify({
    nodes: [...s.nodes].sort(byId).map(n => [n.id, n.parentId, n.title, n.content, n.hyperlink, n.imageUrl, n.color, n.notes,
      n.shape, n.styleOverrides, n.positionX, n.positionY, n.sortOrder, !!n.collapsed, !!n.floating]),
    edges: [...s.edges].sort(byId).map(e => [e.id, e.sourceId, e.targetId, e.label ?? null, e.style ?? null]),
  })
}

export type MindmapStoreApi = StoreApi<MindmapState>

export const MindmapStoreContext = createContext<MindmapStoreApi | null>(null)

/** Titles given to nodes the user creates; saved into the map, so in the UI language. */
export interface MindmapLabels { newTopic: string; floatingTopic: string; summary: string }
const DEFAULT_LABELS: MindmapLabels = { newTopic: 'New Topic', floatingTopic: 'Floating Topic', summary: 'Summary' }

/** Default node titles in the current UI language, read when a node is created. */
export function useMindmapLabels(): () => MindmapLabels {
  const t = useT()
  const ref = useRef(t)
  ref.current = t
  return useCallback(() => ({
    newTopic: ref.current('mindmap.newTopic'),
    floatingTopic: ref.current('mindmap.addFloating'),
    summary: ref.current('mindmap.summaryTopic'),
  }), [])
}

export function createMindmapStore(baseApi: BanjuanAPI, labels: () => MindmapLabels = () => DEFAULT_LABELS): MindmapStoreApi {
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  // Every node/edge write goes through here: counted while in flight, and
  // announced when done so another editor showing this map reloads it.
  const changeSource = {}
  let writesInFlight = 0
  // A plain wrapper, not a Proxy: the desktop API object comes frozen through
  // contextBridge, and a Proxy may not hand out anything but its frozen values.
  const trackedMindmaps = wrapMethods(baseApi.mindmaps, (name, fn) => {
    if (!/^(add|update|remove|restore)/.test(name)) return fn
    return (...args: unknown[]) => {
      writesInFlight++
      return Promise.resolve(fn(...args))
        .then((result) => {
          const id = store.getState().mindmapId
          if (id) announceNoteChanged(id, changeSource)
          return result
        })
        .finally(() => { writesInFlight-- })
    }
  })
  const api: BanjuanAPI = { ...baseApi, mindmaps: trackedMindmaps }
  const writePersist = async (get: () => MindmapState) => {
    const { mindmapId, mindmapTitle, layout, layoutChosen, theme, rfNodes, titleDirty } = get()
    if (!mindmapId) return
    // Node sizes are measured into one store shared by every open map: save
    // only this map's nodes (it used to save — and, on open, wipe — the others').
    const sizes = useNodeSizeStore.getState().sizes
    const nodeSizes: Record<string, { w: number; h: number }> = {}
    for (const n of rfNodes) {
      const s = sizes.get(n.id)
      if (s) nodeSizes[n.id] = { w: s.width, h: s.height }
    }
    store.setState({ savedSizeKey: sizeKeyOf(rfNodes) })
    // The title only when it was edited here: sending the loaded one back on
    // every layout/size save undid a rename made elsewhere.
    const updates: { title?: string; typeMeta: Record<string, unknown> } = { typeMeta: { layout, theme, nodeSizes, ...(layoutChosen ? { layoutChosen } : {}) } }
    if (titleDirty) { updates.title = mindmapTitle; store.setState({ titleDirty: false }) }
    await api.notes.update(mindmapId, updates).catch(reportSaveError)
  }
  // Background writes (node edits, layout/theme) must not fail silently: the
  // canvas already shows the change, so tell the user it didn't reach disk.
  const reportSaveError = (e: unknown) => {
    console.error('[Mindmap] save failed', e)
    toast.error({ key: 'note.saveFailedDetail', args: [errorMessage(e)] }, { key: 'note-save' })
  }

  const store = createStore<MindmapState>((set, get) => ({
    mindmapId: null,
    mindmapTitle: '',
    layout: 'logical',
    layoutChosen: false,
    titleDirty: false,
    theme: 'classic',
    savedSizeKey: '',

    rfNodes: [],
    rfEdges: [],
    selectedNodeIds: [],
    editingNodeId: null,

    history: [],
    historyIndex: -1,

    dropTarget: null,

    connectMode: false,
    connectSourceId: null,

    boundaries: [],
    summaries: [],

    sidePanelType: 'none',
    sidePanelNodeId: null,

    init: async (mindmapId: string) => {
      const mm = await api.notes.get(mindmapId)
      if (!mm) return
      const [apiNodes, apiEdges, apiBoundaries, apiSummaries] = await Promise.all([
        api.mindmaps.getNodes(mindmapId),
        api.mindmaps.getEdges(mindmapId),
        api.mindmaps.getBoundaries(mindmapId),
        api.mindmaps.getSummaries(mindmapId),
      ])
      const rfNodes = apiNodesToRfNodes(apiNodes, mindmapId)
      const summariesData = apiSummaries.map((s: any) => ({ id: s.id, nodeIds: s.nodeIds, summaryNodeId: s.summaryNodeId }))
      const summaryNodeIds = new Set(summariesData.map(s => s.summaryNodeId))
      for (const n of rfNodes) {
        if (summaryNodeIds.has(n.id) && !n.data.floating) {
          n.data = { ...n.data, floating: true }
        }
      }
      const rfEdges = apiEdgesToRfEdges(rfNodes, apiEdges)
      // Every map was created with layout 'mindmap' but, until the layouts were
      // implemented, drawn as a logic chart. One the user never switched keeps
      // that look (and the menu says so); a picked layout is used as picked.
      const savedLayout: string | undefined = mm.typeMeta?.layout ?? (mm as any).layout
      const layoutChosen = !!mm.typeMeta?.layoutChosen
      const mmLayout = savedLayout && (savedLayout !== 'mindmap' || layoutChosen) ? savedLayout : 'logical'
      const mmTheme = mm.typeMeta?.theme ?? (mm as any).theme ?? 'classic'
      const savedSizes = mm.typeMeta?.nodeSizes as Record<string, { w: number; h: number }> | undefined
      const initSizes = new Map<string, { width: number; height: number }>()
      if (savedSizes) {
        for (const [id, s] of Object.entries(savedSizes)) {
          initSizes.set(id, { width: s.w, height: s.h })
        }
      }
      const layoutResult = layoutMindmap(rfNodes, rfEdges, {
        layout: mmLayout,
        nodeSizes: initSizes,
        summaries: summariesData,
      })
      const sizeStore = useNodeSizeStore.getState()
      for (const [id, s] of initSizes) {
        sizeStore.setNodeSize(id, s.width, s.height)
      }
      set({
        mindmapId,
        mindmapTitle: mm.title,
        layout: mmLayout,
        layoutChosen,
        titleDirty: false,
        theme: mmTheme,
        savedSizeKey: sizeKeyOf(layoutResult.nodes),
        rfNodes: layoutResult.nodes,
        rfEdges: layoutResult.edges,
        selectedNodeIds: [],
        editingNodeId: null,
        history: [{ rfNodes: layoutResult.nodes, rfEdges: layoutResult.edges }],
        historyIndex: 0,
        boundaries: apiBoundaries.map((b: any) => ({ id: b.id, nodeIds: b.nodeIds, label: b.label ?? '', color: b.color })),
        summaries: apiSummaries.map((s: any) => ({ id: s.id, nodeIds: s.nodeIds, summaryNodeId: s.summaryNodeId })),
      })
    },

    setLayout: (layout) => {
      set({ layout, layoutChosen: true })
      get().persist()
    },
    setTheme: (theme) => {
      set({ theme })
      get().persist()
    },
    setTitle: (title) => {
      set({ mindmapTitle: title, titleDirty: true })
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

    addNode: async (parentId) => {
      const { mindmapId, rfNodes } = get()
      if (!mindmapId) return null
      const effectiveParentId = parentId ?? rfNodes.find(n => !n.data.parentId && !n.data.floating)?.id ?? null
      const title = labels().newTopic

      const node = await api.mindmaps.addNode(mindmapId, {
        title,
        parentId: effectiveParentId ?? undefined,
      })
      const depths = buildTreeDepths(rfNodes)
      const parentDepth = effectiveParentId ? (depths.get(effectiveParentId) ?? 0) : -1
      const parentNode = effectiveParentId ? rfNodes.find(n => n.id === effectiveParentId) : null
      const initPos = parentNode
        ? { x: parentNode.position.x + 200, y: parentNode.position.y }
        : { x: 0, y: 0 }
      const newRfNode: Node<MindmapNodeData> = {
        id: node.id,
        type: 'default',
        position: initPos,
        data: {
          id: node.id, mindmapId, parentId: node.parentId,
          title: node.title, content: null,
          hyperlink: null, imageUrl: null,
          color: null, notes: null, shape: null, styleOverrides: null,
          positionX: null, positionY: null,
          sortOrder: node.sortOrder, collapsed: false, floating: false,
          depth: parentDepth + 1,
        },
      }
      const updatedNodes = [...rfNodes, newRfNode]
      const treeEdges: Edge[] = []
      for (const n of updatedNodes) {
        if (n.data.parentId) {
          treeEdges.push({ id: `tree-${n.data.parentId}-${n.id}`, source: n.data.parentId, target: n.id, type: 'treeEdge', sourceHandle: 'source-right', targetHandle: 'target-left' })
        }
      }
      const relationEdges = get().rfEdges.filter(e => e.type === 'relationEdge')
      set({ rfNodes: updatedNodes, rfEdges: [...treeEdges, ...relationEdges], selectedNodeIds: [node.id] })
      get().pushHistory()
      return node.id
    },

    addFloatingNode: async () => {
      const { mindmapId, rfNodes } = get()
      if (!mindmapId) return null
      const rootNode = rfNodes.find(n => !n.data.parentId && !n.data.floating)
      const absX = (rootNode?.position.x ?? 0) + 200
      const absY = (rootNode?.position.y ?? 0) - 200
      const node = await api.mindmaps.addNode(mindmapId, {
        title: labels().floatingTopic,
        floating: true,
        positionX: absX,
        positionY: absY,
      })
      const newRfNode: Node<MindmapNodeData> = {
        id: node.id,
        type: 'default',
        position: { x: node.positionX ?? absX, y: node.positionY ?? absY },
        draggable: true,
        data: {
          id: node.id, mindmapId, parentId: null,
          title: node.title, content: null,
          hyperlink: null, imageUrl: null,
          color: null, notes: null, shape: null, styleOverrides: null,
          positionX: node.positionX ?? absX, positionY: node.positionY ?? absY,
          sortOrder: node.sortOrder, collapsed: false, floating: true,
          depth: 0,
        },
      }
      set({ rfNodes: [...rfNodes, newRfNode], selectedNodeIds: [node.id] })
      get().pushHistory()
      return node.id
    },

    addSiblingNode: async (siblingId) => {
      const sibling = get().rfNodes.find(n => n.id === siblingId)
      if (!sibling || !sibling.data.parentId) return null
      return get().addNode(sibling.data.parentId)
    },

    removeNode: async (id) => {
      const { rfNodes, summaries } = get()
      const node = rfNodes.find(n => n.id === id)
      if (node && !node.data.parentId && !node.data.floating) return
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

      const affectedSummaries = summaries.filter(s =>
        descendantIds.has(s.summaryNodeId) || s.nodeIds.some(nid => descendantIds.has(nid))
      )
      for (const s of affectedSummaries) {
        if (descendantIds.has(s.summaryNodeId)) {
          api.mindmaps.removeSummary(s.id).catch(() => {})
        }
      }

      set({
        rfNodes: get().rfNodes.filter(n => !descendantIds.has(n.id)),
        rfEdges: get().rfEdges.filter(e => !descendantIds.has(e.source) && !descendantIds.has(e.target)),
        selectedNodeIds: get().selectedNodeIds.filter(i => !descendantIds.has(i)),
        summaries: get().summaries
          .filter(s => !descendantIds.has(s.summaryNodeId))
          .map(s => {
            const filtered = s.nodeIds.filter(nid => !descendantIds.has(nid))
            return filtered.length !== s.nodeIds.length ? { ...s, nodeIds: filtered } : s
          })
          .filter(s => s.nodeIds.length > 0),
        sidePanelType: 'none' as const,
        sidePanelNodeId: null,
      })
      get().pushHistory()
      await api.mindmaps.removeNode(id)
    },

    updateNodeData: async (id, updates) => {
      if (!get().rfNodes.find(n => n.id === id)) return
      set({
        rfNodes: get().rfNodes.map(n =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } as MindmapNodeData } : n
        ),
      })
      get().pushHistory()
      // Resolves once written (callers that must know — a flush on close — await it).
      await api.mindmaps.updateNode(id, updates).catch(reportSaveError)
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

      await api.mindmaps.updateNode(nodeId, { parentId: newParentId ?? undefined })
      if (insertIndex !== undefined) {
        await api.mindmaps.updateNode(nodeId, { sortOrder: insertIndex })
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
          treeEdges.push({ id: `tree-${n.data.parentId}-${n.id}`, source: n.data.parentId, target: n.id, type: 'treeEdge', sourceHandle: 'source-right', targetHandle: 'target-left' })
        }
      }
      const relationEdges = get().rfEdges.filter(e => e.type === 'relationEdge')
      set({ rfNodes: withDepths, rfEdges: [...treeEdges, ...relationEdges] })
      get().pushHistory()
    },

    reorderSiblings: async (nodeId, newIndex) => {
      const { rfNodes } = get()
      const node = rfNodes.find(n => n.id === nodeId)
      if (!node || !node.data.parentId) return
      const siblings = rfNodes
        .filter(n => n.data.parentId === node.data.parentId && n.id !== nodeId)
        .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
      siblings.splice(newIndex, 0, node)
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].data.sortOrder !== i) {
          await api.mindmaps.updateNode(siblings[i].id, { sortOrder: i })
        }
      }
      set({
        rfNodes: get().rfNodes.map(n => {
          const idx = siblings.findIndex(s => s.id === n.id)
          if (idx >= 0) return { ...n, data: { ...n.data, sortOrder: idx } }
          return n
        }),
      })
      get().pushHistory()
    },

    setDropTarget: (target) => set({ dropTarget: target }),

    toggleCollapse: async (id) => {
      const node = get().rfNodes.find(n => n.id === id)
      if (!node) return
      const newCollapsed = !node.data.collapsed
      await api.mindmaps.updateNode(id, { collapsed: newCollapsed })
      set({
        rfNodes: get().rfNodes.map(n =>
          n.id === id ? { ...n, data: { ...n.data, collapsed: newCollapsed } } : n
        ),
      })
    },

    addRelationEdge: async (sourceId, targetId, label) => {
      const { mindmapId } = get()
      if (!mindmapId) return
      const edge = await api.mindmaps.addEdge(mindmapId, { sourceId, targetId, label })
      set({
        rfEdges: [...get().rfEdges, { id: edge.id, source: sourceId, target: targetId, type: 'relationEdge', data: { label } }],
      })
      get().pushHistory()
    },

    updateRelationEdge: async (edgeId, updates) => {
      await api.mindmaps.updateEdge(edgeId, updates)
      set({
        rfEdges: get().rfEdges.map(e =>
          e.id === edgeId ? { ...e, data: { ...e.data, ...updates } } : e
        ),
      })
      get().pushHistory()
    },

    removeRelationEdge: async (edgeId) => {
      await api.mindmaps.removeEdge(edgeId)
      set({ rfEdges: get().rfEdges.filter(e => e.id !== edgeId) })
      get().pushHistory()
    },

    setConnectMode: (on) => set({ connectMode: on, connectSourceId: null }),
    setConnectSourceId: (id) => set({ connectSourceId: id }),

    addBoundary: async (nodeIds, label) => {
      const { mindmapId } = get()
      if (!mindmapId || nodeIds.length === 0) return
      const b = await api.mindmaps.addBoundary(mindmapId, { nodeIds, label })
      set({ boundaries: [...get().boundaries, { id: b.id, nodeIds: b.nodeIds, label: b.label ?? '', color: b.color }] })
    },

    updateBoundary: async (id, updates) => {
      await api.mindmaps.updateBoundary(id, updates)
      set({
        boundaries: get().boundaries.map(b =>
          b.id === id ? { ...b, ...updates } : b
        ),
      })
    },

    removeBoundary: async (id) => {
      await api.mindmaps.removeBoundary(id)
      set({ boundaries: get().boundaries.filter(b => b.id !== id) })
    },

    addSummary: async (nodeIds) => {
      const { mindmapId } = get()
      if (!mindmapId || nodeIds.length === 0) return
      const result = await api.mindmaps.addSummary(mindmapId, { nodeIds, summaryTitle: labels().summary })
      const summaryNode = result.summaryNode
      const depths = buildTreeDepths(get().rfNodes)
      const maxDepth = Math.max(...nodeIds.map(id => depths.get(id) ?? 0))
      const newRfNode: Node<MindmapNodeData> = {
        id: summaryNode.id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          id: summaryNode.id, mindmapId, parentId: null,
          title: summaryNode.title, content: null,
          hyperlink: null, imageUrl: null,
          color: null, notes: null, shape: null, styleOverrides: null,
          positionX: null, positionY: null,
          sortOrder: summaryNode.sortOrder ?? 0, collapsed: false, floating: true,
          depth: maxDepth + 1,
        },
      }
      set({
        rfNodes: [...get().rfNodes, newRfNode],
        summaries: [...get().summaries, { id: result.summary.id, nodeIds: result.summary.nodeIds, summaryNodeId: summaryNode.id }],
      })
    },

    removeSummary: async (id) => {
      const summary = get().summaries.find(s => s.id === id)
      if (!summary) return
      await api.mindmaps.removeSummary(id)
      set({
        summaries: get().summaries.filter(s => s.id !== id),
        rfNodes: get().rfNodes.filter(n => n.id !== summary.summaryNodeId),
        rfEdges: get().rfEdges.filter(e => e.source !== summary.summaryNodeId && e.target !== summary.summaryNodeId),
      })
    },

    pushHistory: () => {
      const { rfNodes, rfEdges, history, historyIndex } = get()
      const trimmed = history.slice(0, historyIndex + 1)
      const newHistory = [...trimmed, { rfNodes, rfEdges }]
      if (newHistory.length > 50) newHistory.shift()
      set({ history: newHistory, historyIndex: newHistory.length - 1 })
    },

    // Undo/redo used to change only the canvas: the database and file kept the
    // undone edit, so it came back on reopen. Now the step is written too.
    undo: () => {
      const { historyIndex, history, mindmapId } = get()
      if (historyIndex <= 0) return
      const prev = history[historyIndex - 1]
      set({ rfNodes: prev.rfNodes, rfEdges: prev.rfEdges, historyIndex: historyIndex - 1 })
      if (mindmapId) void api.mindmaps.restore(mindmapId, toSnapshot(prev.rfNodes, prev.rfEdges)).catch(reportSaveError)
    },

    redo: () => {
      const { historyIndex, history, mindmapId } = get()
      if (historyIndex >= history.length - 1) return
      const next = history[historyIndex + 1]
      set({ rfNodes: next.rfNodes, rfEdges: next.rfEdges, historyIndex: historyIndex + 1 })
      if (mindmapId) void api.mindmaps.restore(mindmapId, toSnapshot(next.rfNodes, next.rfEdges)).catch(reportSaveError)
    },

    openSidePanel: (type, nodeId) => set({ sidePanelType: type, sidePanelNodeId: nodeId ?? null }),
    closeSidePanel: () => set({ sidePanelType: 'none', sidePanelNodeId: null }),

    persist: async () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => { persistTimer = null; void writePersist(get) }, 500)
    },
    flushPersist: async () => {
      if (!persistTimer) return
      clearTimeout(persistTimer)
      persistTimer = null
      await writePersist(get)
    },

    changeSource,
    reloadIfChanged: async () => {
      const { mindmapId } = get()
      if (!mindmapId) return
      const [nodes, edges] = await Promise.all([baseApi.mindmaps.getNodes(mindmapId), baseApi.mindmaps.getEdges(mindmapId)])
      const stored = snapshotKey({
        nodes: nodes.map(({ mindmapId: _m, createdAt: _c, ...n }) => n),
        edges: edges.map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId, label: e.label, style: e.style })),
      })
      if (get().mindmapId !== mindmapId || stored === snapshotKey(toSnapshot(get().rfNodes, get().rfEdges))) return
      if (persistTimer || writesInFlight > 0) {
        toast.info({ key: 'note.changedElsewhere' }, { key: `note-changed-${mindmapId}` })
        return
      }
      await get().init(mindmapId)
    },
  }))
  return store
}

export function useMindmapStore(): MindmapState
export function useMindmapStore<T>(selector: (state: MindmapState) => T): T
export function useMindmapStore<T>(selector?: (state: MindmapState) => T): T | MindmapState {
  const store = useContext(MindmapStoreContext)
  if (!store) throw new Error('useMindmapStore must be used within MindmapStoreContext.Provider')
  return useStore(store, selector as (state: MindmapState) => T)
}

export function useMindmapStoreApi(): MindmapStoreApi {
  const store = useContext(MindmapStoreContext)
  if (!store) throw new Error('useMindmapStoreApi must be used within MindmapStoreContext.Provider')
  return store
}

/** Keep this canvas's map current when another editor, a sync or the AI assistant changes it. */
export function useFollowMindmapChanges(): void {
  const storeApi = useMindmapStoreApi()
  const mindmapId = useMindmapStore(s => s.mindmapId)
  useNoteChangedElsewhere(mindmapId, storeApi.getState().changeSource, () => { void storeApi.getState().reloadIfChanged() })
}
