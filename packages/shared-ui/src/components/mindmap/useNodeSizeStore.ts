import { create } from 'zustand'

interface NodeSizeStore {
  sizes: Map<string, { width: number; height: number }>
  version: number
  setNodeSize: (nodeId: string, width: number, height: number) => void
  reset: () => void
}

export const useNodeSizeStore = create<NodeSizeStore>((set, get) => ({
  sizes: new Map(),
  version: 0,
  setNodeSize: (nodeId, width, height) => {
    const prev = get().sizes.get(nodeId)
    if (prev && prev.width === width && prev.height === height) return
    get().sizes.set(nodeId, { width, height })
    set({ version: get().version + 1 })
  },
  reset: () => {
    get().sizes.clear()
    set({ version: 0 })
  },
}))
