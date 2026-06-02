import React from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'

// An atomic (content: 'none') inline reference to another note. Atomic inline
// content is a single non-editable node, so ProseMirror routes clicks to it
// reliably even when it sits mid-line after other text — unlike editable
// ('styled') content, where a mid-line click becomes cursor placement and never
// reaches onClick. The display label is carried in the `title` prop.
export const NoteLink = createReactInlineContentSpec(
  {
    type: 'noteLink' as const,
    propSchema: {
      noteId: { default: '' },
      title: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const { noteId, title } = props.inlineContent.props
      return (
        <span
          className="note-link-inline"
          data-note-id={noteId}
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            document.dispatchEvent(
              new CustomEvent('note-link-click', { detail: { noteId } })
            )
          }}
        >{title}</span>
      )
    },
  }
)
