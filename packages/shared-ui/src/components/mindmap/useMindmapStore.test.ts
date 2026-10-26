// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createMindmapStore } from './useMindmapStore.js'

const deepFreeze = <T extends object>(o: T): T => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o) }

describe('mind-map store over a frozen API (as contextBridge exposes it)', () => {
  it('loads the map and announces its own writes', async () => {
    const nodes = [
      { id: 'r', mindmapId: 'm', parentId: null, title: 'Root', content: null, hyperlink: null, imageUrl: null, color: null, notes: null, shape: null, styleOverrides: null, positionX: null, positionY: null, sortOrder: 0, collapsed: false, floating: false, createdAt: '' },
      { id: 'a', mindmapId: 'm', parentId: 'r', title: 'A', content: null, hyperlink: null, imageUrl: null, color: null, notes: null, shape: null, styleOverrides: null, positionX: null, positionY: null, sortOrder: 0, collapsed: false, floating: false, createdAt: '' },
    ]
    const updateNode = vi.fn(async () => nodes[1])
    const api = deepFreeze({
      notes: { get: async () => ({ id: 'm', title: 'Map', typeMeta: {} }), update: async () => ({}) },
      mindmaps: {
        getNodes: async () => nodes, getEdges: async () => [], getBoundaries: async () => [], getSummaries: async () => [],
        updateNode,
      },
    }) as any
    const store = createMindmapStore(api)
    await store.getState().init('m')
    expect(store.getState().rfNodes.map(n => n.id).sort()).toEqual(['a', 'r'])

    const seen: any[] = []
    document.addEventListener('banjuan:note-content-changed', e => seen.push((e as CustomEvent).detail))
    await store.getState().updateNodeData('a', { title: 'A2' })
    await new Promise(r => setTimeout(r, 0))
    expect(updateNode).toHaveBeenCalledWith('a', { title: 'A2' })
    expect(seen).toEqual([{ noteId: 'm', source: store.getState().changeSource }])
  })
})
