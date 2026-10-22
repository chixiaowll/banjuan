import React from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { useT } from '../../../i18n/index.js'
import { requestDocPage } from '../../../utils/docNavigation.js'

export const AnnotationEmbed = createReactBlockSpec(
  {
    type: 'annotationEmbed' as const,
    propSchema: {
      docId: { default: '' },
      annotationId: { default: '' },
      quote: { default: '' },
      comment: { default: '' },
      docTitle: { default: '' },
      page: { default: 0 },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const t = useT()
      const { quote, comment, docTitle, page, docId } = props.block.props
      // "Jump to source": open the document at the annotation's page.
      const openSource = () => {
        if (!docId) return
        requestDocPage(docId, page)
        document.dispatchEvent(new CustomEvent('banjuan:open-document', { detail: { docId } }))
      }

      return (
        <div className="annotation-embed" contentEditable={false} onClick={openSource} style={docId ? { cursor: 'pointer' } : undefined}>
          <div className="embed-source">
            📄 {docTitle || t('embed.document')} {page ? t('embed.pageShort', page) : ''}
          </div>
          {quote && (
            <div className="embed-quote">"{quote}"</div>
          )}
          {comment && (
            <div style={{ marginBottom: 8 }}>{comment}</div>
          )}
          <div className="embed-jump">
            {t('embed.jumpToSource')} →
          </div>
        </div>
      )
    },
  }
)()
