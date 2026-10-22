import React from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { useT } from '../../../i18n/index.js'

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
      const t = useT()
      const { docTitle, authors, pageCount } = props.block.props

      return (
        <div className="document-embed" contentEditable={false}>
          <div className="embed-title">📄 {docTitle || t('embed.untitledDocument')}</div>
          <div className="embed-meta">
            {authors && <span>{authors}</span>}
            {pageCount > 0 && <span> · {t('embed.pageCount', pageCount)}</span>}
            <span style={{ marginLeft: 'auto', color: '#5e81ac' }}> {t('embed.openDocument')} →</span>
          </div>
        </div>
      )
    },
  }
)()
