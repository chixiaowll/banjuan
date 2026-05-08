import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { HandwritingPage, HandwritingTemplate, CanvasSnapshot } from '@banjuan/core'
import type { BanjuanAPI } from '../../api.js'

export interface HandwritingState {
  noteId: string | null
  pages: HandwritingPage[]
  currentPageIndex: number
  pageSize: { width: number; height: number }
  defaultTemplate: HandwritingTemplate
  saving: boolean
  thumbnails: Map<string, string>

  init: (noteId: string) => Promise<void>
  setCurrentPage: (index: number) => void
  addPage: (afterIndex: number, template?: HandwritingTemplate) => void
  deletePage: (index: number) => void
  duplicatePage: (index: number) => void
  movePage: (fromIndex: number, toIndex: number) => void
  setPageTemplate: (index: number, template: HandwritingTemplate) => void
  saveCurrentPageSnapshot: (snapshot: CanvasSnapshot) => void
  save: () => Promise<void>
  updateThumbnail: (pageId: string, dataUrl: string) => void
}

type HandwritingStoreApi = StoreApi<HandwritingState>

export const HandwritingStoreContext = createContext<HandwritingStoreApi | null>(null)

function generatePageId(): string {
  return crypto.randomUUID()
}

export function createHandwritingStore(api: BanjuanAPI): HandwritingStoreApi {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  return createStore<HandwritingState>((set, get) => ({
    noteId: null,
    pages: [],
    currentPageIndex: 0,
    pageSize: { width: 1024, height: 768 },
    defaultTemplate: 'blank',
    saving: false,
    thumbnails: new Map(),

    init: async (noteId: string) => {
      const note = await api.notes.get(noteId)
      if (!note) return
      const data = JSON.parse(note.content)
      const typeMeta = note.typeMeta ?? {}
      set({
        noteId,
        pages: data.pages ?? [],
        currentPageIndex: data.currentPageIndex ?? 0,
        pageSize: (typeMeta as any).pageSize ?? { width: 1024, height: 768 },
        defaultTemplate: (typeMeta as any).defaultTemplate ?? 'blank',
      })
    },

    setCurrentPage: (index: number) => {
      const { pages } = get()
      if (index >= 0 && index < pages.length) {
        set({ currentPageIndex: index })
      }
    },

    addPage: (afterIndex: number, template?: HandwritingTemplate) => {
      const { pages, defaultTemplate } = get()
      const newPage: HandwritingPage = {
        id: generatePageId(),
        template: template ?? defaultTemplate,
        snapshot: { strokes: [] },
      }
      const newPages = [...pages]
      newPages.splice(afterIndex + 1, 0, newPage)
      set({ pages: newPages, currentPageIndex: afterIndex + 1 })
      get().save()
    },

    deletePage: (index: number) => {
      const { pages, currentPageIndex } = get()
      if (pages.length <= 1) return
      const newPages = pages.filter((_, i) => i !== index)
      const newIndex = currentPageIndex >= newPages.length ? newPages.length - 1 : currentPageIndex
      set({ pages: newPages, currentPageIndex: newIndex })
      get().save()
    },

    duplicatePage: (index: number) => {
      const { pages } = get()
      const source = pages[index]
      if (!source) return
      const newPage: HandwritingPage = {
        id: generatePageId(),
        template: source.template,
        snapshot: JSON.parse(JSON.stringify(source.snapshot)),
      }
      const newPages = [...pages]
      newPages.splice(index + 1, 0, newPage)
      set({ pages: newPages, currentPageIndex: index + 1 })
      get().save()
    },

    movePage: (fromIndex: number, toIndex: number) => {
      const { pages } = get()
      const newPages = [...pages]
      const [moved] = newPages.splice(fromIndex, 1)
      newPages.splice(toIndex, 0, moved)
      set({ pages: newPages, currentPageIndex: toIndex })
      get().save()
    },

    setPageTemplate: (index: number, template: HandwritingTemplate) => {
      const { pages } = get()
      const newPages = [...pages]
      newPages[index] = { ...newPages[index], template }
      set({ pages: newPages })
      get().save()
    },

    saveCurrentPageSnapshot: (snapshot: CanvasSnapshot) => {
      const { pages, currentPageIndex } = get()
      const newPages = [...pages]
      newPages[currentPageIndex] = { ...newPages[currentPageIndex], snapshot }
      set({ pages: newPages })

      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => get().save(), 500)
    },

    save: async () => {
      const { noteId, pages, currentPageIndex } = get()
      if (!noteId) return
      set({ saving: true })
      try {
        await api.notes.update(noteId, {
          content: JSON.stringify({ pages, currentPageIndex }),
        })
      } finally {
        set({ saving: false })
      }
    },

    updateThumbnail: (pageId: string, dataUrl: string) => {
      const { thumbnails } = get()
      const newThumbnails = new Map(thumbnails)
      newThumbnails.set(pageId, dataUrl)
      set({ thumbnails: newThumbnails })
    },
  }))
}

export function useHandwritingStore(): HandwritingState
export function useHandwritingStore<T>(selector: (state: HandwritingState) => T): T
export function useHandwritingStore<T>(selector?: (state: HandwritingState) => T): T | HandwritingState {
  const store = useContext(HandwritingStoreContext)
  if (!store) throw new Error('useHandwritingStore must be used within HandwritingStoreContext.Provider')
  return useStore(store, selector as (state: HandwritingState) => T)
}

export function useHandwritingStoreApi(): HandwritingStoreApi {
  const store = useContext(HandwritingStoreContext)
  if (!store) throw new Error('useHandwritingStoreApi must be used within HandwritingStoreContext.Provider')
  return store
}
