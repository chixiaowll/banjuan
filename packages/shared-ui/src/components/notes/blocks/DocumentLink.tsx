import React from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'

// Atomic (content: 'none') inline reference to a document. See NoteLink.tsx for
// why atomic content is required for reliable mid-line clicks. Label is in `title`.
export const DocumentLink = createReactInlineContentSpec(
  {
    type: 'documentLink' as const,
    propSchema: {
      docId: { default: '' },
      title: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const { docId, title } = props.inlineContent.props
      return (
        <span
          className="document-link-inline"
          data-doc-id={docId}
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            document.dispatchEvent(
              new CustomEvent('document-link-click', { detail: { docId, title } })
            )
          }}
        >{title}</span>
      )
    },
  }
)
