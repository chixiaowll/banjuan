import React from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'

export const DocumentLink = createReactInlineContentSpec(
  {
    type: 'documentLink' as const,
    propSchema: {
      docId: { default: '' },
    },
    content: 'styled',
  },
  {
    render: (props) => {
      const { docId } = props.inlineContent.props
      return (
        <span
          className="document-link-inline"
          data-doc-id={docId}
          ref={props.contentRef}
          // Non-editable so a mid-line reference fires onClick (navigates)
          // instead of ProseMirror grabbing the click for cursor placement.
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            document.dispatchEvent(
              new CustomEvent('document-link-click', { detail: { docId } })
            )
          }}
        />
      )
    },
  }
)
