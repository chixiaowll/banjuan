import { create } from 'zustand'
import type { ExportFormat } from '../api.js'

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
  format: ExportFormat
  isRunning: boolean
  panelVisible: boolean
  panelMinimized: boolean

  startExport: (items: Omit<ExportItem, 'status'>[], outputDir: string, format: ExportFormat) => void
  updateItem: (id: string, updates: Partial<ExportItem>) => void
  setRunning: (running: boolean) => void
  togglePanel: () => void
  minimizePanel: () => void
  restorePanel: () => void
  closePanel: () => void
  /** Fully dismiss the panel and clear its items (the pill's explicit close). */
  dismiss: () => void
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
    const wasVisible = get().panelVisible
    set({
      // Accumulate across export runs (download-manager style) rather than
      // replacing — multiple exports share one panel.
      items: [...get().items, ...items.map(i => ({ ...i, status: 'pending' as const }))],
      outputDir,
      format,
      isRunning: true,
      panelVisible: true,
      // Only auto-expand when the panel was fully dismissed; if the user had it
      // minimized, respect that and keep it collapsed.
      panelMinimized: wasVisible ? get().panelMinimized : false,
    })
  },

  updateItem: (id, updates) => {
    const items = get().items.map(i => i.id === id ? { ...i, ...updates } : i)
    const isRunning = items.some(i => i.status === 'pending' || i.status === 'exporting')
    set({ items, isRunning })
  },

  setRunning: (running) => set({ isRunning: running }),
  togglePanel: () => set({ panelVisible: !get().panelVisible }),
  minimizePanel: () => set({ panelMinimized: true }),
  restorePanel: () => set({ panelMinimized: false }),
  closePanel: () => set({ panelVisible: false }),
  dismiss: () => set({ panelVisible: false, panelMinimized: false, items: [] }),
  clearDone: () => set({ items: get().items.filter(i => i.status !== 'done') }),
}))
