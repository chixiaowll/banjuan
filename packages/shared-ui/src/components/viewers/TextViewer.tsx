import React, { useEffect, useState } from 'react'
import { useBanjuanAPI } from '../../api.js'

interface Props {
  docPath: string
}

export default function TextViewer({ docPath }: Props) {
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

  const lines = content.split('\n')

  return (
    <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: 14, lineHeight: 1.6 }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex' }}>
          <span style={{
            color: 'var(--text-muted)', width: 50, textAlign: 'right',
            marginRight: 16, flexShrink: 0, userSelect: 'none'
          }}>
            {i + 1}
          </span>
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {line || ' '}
          </span>
        </div>
      ))}
    </div>
  )
}
