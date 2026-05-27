import { create } from 'zustand'

export type ExportItemStatus = 'pending' | 'exporting' | 'done' | 'error'

export interface ExportItem {
  id: string
  noteId: string
  title: string
  subPath: string
  status: ExportItemStatus
  error?: string
}

interface ExportManagerState {
  items: ExportItem[]
  outputDir: string | null
  format: 'markdown' | 'pdf'
  isRunning: boolean
  panelVisible: boolean
  panelMinimized: boolean

  startExport: (items: Omit<ExportItem, 'status'>[], outputDir: string, format: 'markdown' | 'pdf') => void
  updateItem: (id: string, updates: Partial<ExportItem>) => void
  setRunning: (running: boolean) => void
  togglePanel: () => void
  minimizePanel: () => void
  restorePanel: () => void
  closePanel: () => void
  clearDone: () => void
}

export const useExportManagerStore = create<ExportManagerState>((set, get) => ({
  items: [],
  outputDir: null,
  format: 'markdown',
  isRunning: false,
  panelVisible: false,
  panelMinimized: false,

  startExport: (items, outputDir, format) => {
    set({
      items: items.map(i => ({ ...i, status: 'pending' as const })),
      outputDir,
      format,
      isRunning: true,
      panelVisible: true,
      panelMinimized: false,
    })
  },

  updateItem: (id, updates) => {
    set({ items: get().items.map(i => i.id === id ? { ...i, ...updates } : i) })
  },

  setRunning: (running) => set({ isRunning: running }),
  togglePanel: () => set({ panelVisible: !get().panelVisible }),
  minimizePanel: () => set({ panelMinimized: true }),
  restorePanel: () => set({ panelMinimized: false }),
  closePanel: () => set({ panelVisible: false }),
  clearDone: () => set({ items: get().items.filter(i => i.status !== 'done') }),
}))
