import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useBanjuanAPI } from '../../api.js'

interface Props {
  docPath: string
}

export default function MarkdownViewer({ docPath }: Props) {
  const api = useBanjuanAPI()
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.documents.readContent(docPath).then((text) => {
      setContent(text)
      setLoading(false)
    })
  }, [docPath])

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>

  return (
    <div style={{
      padding: '24px 48px', maxWidth: 800, margin: '0 auto',
      lineHeight: 1.8, fontSize: 15,
    }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
