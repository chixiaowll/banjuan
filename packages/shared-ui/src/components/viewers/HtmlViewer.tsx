import React, { useEffect, useState, useMemo } from 'react'
import { useBanjuanAPI } from '../../api.js'
import { useEyeProtection, EYE_PROTECTION_TINT } from './useEyeProtection.js'

interface Props {
  docPath: string
}

export default function HtmlViewer({ docPath }: Props) {
  const api = useBanjuanAPI()
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.documents.readContent(docPath).then((text) => {
      setContent(text)
      setLoading(false)
    })
  }, [docPath])

  const blobUrl = useMemo(() => {
    if (!content) return null
    const blob = new Blob([content], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }, [content])

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const { eyeProtection } = useEyeProtection()

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <iframe
        src={blobUrl || undefined}
        sandbox="allow-same-origin"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#fff',
        }}
        title="HTML Document"
      />
      {eyeProtection && <div style={{ position: 'absolute', inset: 0, background: EYE_PROTECTION_TINT, pointerEvents: 'none' }} />}
    </div>
  )
}
