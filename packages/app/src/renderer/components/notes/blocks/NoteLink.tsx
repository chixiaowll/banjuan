import React from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'

export const NoteLink = createReactInlineContentSpec(
  {
    type: 'noteLink' as const,
    propSchema: {
      noteId: { default: '' },
    },
    content: 'styled',
  },
  {
    render: (props) => {
      const { noteId } = props.inlineContent.props
      return (
        <span
          className="note-link-inline"
          data-note-id={noteId}
          ref={props.contentRef}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            document.dispatchEvent(
              new CustomEvent('note-link-click', { detail: { noteId } })
            )
          }}
        />
      )
    },
  }
)
