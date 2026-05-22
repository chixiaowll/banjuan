import React, { useEffect, useState } from 'react'
import { useBanjuanAPI } from '../../api.js'
import { useEyeProtection, EYE_PROTECTION_TINT } from './useEyeProtection.js'

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

  const { eyeProtection } = useEyeProtection()

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>

  const lines = content.split('\n')

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      paddingBottom: 80,
      background: 'var(--surface, #fafbfc)',
      position: 'relative',
    }}>
      {eyeProtection && <div style={{ position: 'sticky', top: 0, left: 0, width: '100%', height: 0, zIndex: 10 }}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100vh', background: EYE_PROTECTION_TINT, pointerEvents: 'none' }} /></div>}
      <div style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '32px 24px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
        fontSize: 13.5,
        lineHeight: 1.7,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} style={{ borderBottom: 'none' }}>
                <td style={{
                  color: 'var(--text-muted, #a0a0a0)',
                  width: 48,
                  textAlign: 'right',
                  paddingRight: 20,
                  paddingTop: 1,
                  paddingBottom: 1,
                  verticalAlign: 'top',
                  userSelect: 'none',
                  borderRight: '1px solid var(--border, #e8e8e8)',
                  fontSize: 12,
                  opacity: 0.7,
                }}>
                  {i + 1}
                </td>
                <td style={{
                  paddingLeft: 20,
                  paddingTop: 1,
                  paddingBottom: 1,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--text-primary, #333)',
                }}>
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
