import { createContext, useContext } from 'react'
import type { LibraryState } from './useLibraryState.js'

/**
 * LibraryView is split into parts (sidebar, home, lists, detail, dialogs, menus)
 * that share one state object from useLibraryState(), provided here.
 */
export const LibraryContext = createContext<LibraryState | null>(null)

export function useLibrary(): LibraryState {
  const lib = useContext(LibraryContext)
  if (!lib) throw new Error('useLibrary must be used inside LibraryView')
  return lib
}
