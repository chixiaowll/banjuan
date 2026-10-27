import { createContext, useContext } from 'react'

/**
 * What a viewer may offer. A file opened on its own (single-file window) is in
 * no library: nothing to store annotations, notes, tags or reading time in.
 * Library windows keep the defaults.
 */
export interface ViewerCapabilities {
  /** Highlights, underlines, ink, area and text notes. */
  annotate: boolean
  /** Tags, linked notes, document info, reading time. */
  library: boolean
}

export const ViewerCapabilitiesContext = createContext<ViewerCapabilities>({ annotate: true, library: true })

export const useViewerCapabilities = () => useContext(ViewerCapabilitiesContext)
