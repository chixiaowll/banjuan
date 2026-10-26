import React from 'react'
import { useBanjuanAPI } from '../../api.js'
import { useDocCover } from '../../utils/useDocCover.js'

/**
 * Renders `children` with the document's cover URL (null until / unless there
 * is one), so a card can show the thumbnail or keep its coloured placeholder.
 */
export default function DocCover({ doc, children }: {
  doc: { id: string; hash?: string }
  children: (cover: string | null) => React.ReactNode
}) {
  const cover = useDocCover(useBanjuanAPI(), doc)
  return <>{children(cover)}</>
}

/** The cover image, filling its (positioned) parent from the top. */
export function CoverImage({ src }: { src: string }) {
  return (
    <img src={src} alt="" draggable={false}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
  )
}
