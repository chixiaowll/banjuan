import React from 'react'
import { createReactBlockSpec } from '@blocknote/react'

export const AnnotationEmbed = createReactBlockSpec(
  {
    type: 'annotationEmbed',
    propSchema: {
      docId: { default: '' },
      annotationId: { default: '' },
      quote: { default: '' },
      comment: { default: '' },
      docTitle: { default: '' },
      page: { default: 0 },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const { docId, annotationId, quote, comment, docTitle, page } = props.block.props

      const handleJump = async () => {
        // Navigate to document at annotation position — implemented when wired into TabManager
      }

      return (
        <div className="annotation-embed" contentEditable={false}>
          <div className="embed-source">
            📄 {docTitle || 'Document'} {page ? `p.${page}` : ''}
          </div>
          {quote && (
            <div className="embed-quote">"{quote}"</div>
          )}
          {comment && (
            <div style={{ marginBottom: 8 }}>{comment}</div>
          )}
          <div className="embed-jump" onClick={handleJump}>
            跳转到原文 →
          </div>
        </div>
      )
    },
  }
)
