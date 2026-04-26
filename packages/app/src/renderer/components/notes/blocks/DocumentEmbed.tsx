import React from 'react'
import { createReactBlockSpec } from '@blocknote/react'

export const DocumentEmbed = createReactBlockSpec(
  {
    type: 'documentEmbed' as const,
    propSchema: {
      docId: { default: '' },
      docTitle: { default: '' },
      authors: { default: '' },
      pageCount: { default: 0 },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { docTitle, authors, pageCount } = props.block.props

      return (
        <div className="document-embed" contentEditable={false}>
          <div className="embed-title">📄 {docTitle || 'Untitled Document'}</div>
          <div className="embed-meta">
            {authors && <span>{authors}</span>}
            {pageCount > 0 && <span> · {pageCount} 页</span>}
            <span style={{ marginLeft: 'auto', color: '#5e81ac' }}> 打开文档 →</span>
          </div>
        </div>
      )
    },
  }
)()
