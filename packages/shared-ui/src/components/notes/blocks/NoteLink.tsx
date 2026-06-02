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
          // Mark the chip non-editable so ProseMirror doesn't treat it as
          // editable text and swallow the click for cursor placement — without
          // this, a reference sitting mid-line (after other text) never fires
          // onClick and can't be navigated.
          contentEditable={false}
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
