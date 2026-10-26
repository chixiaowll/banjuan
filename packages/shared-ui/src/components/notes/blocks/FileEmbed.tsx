import React from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { useBanjuanAPI } from '../../../api.js'
import { useT } from '../../../i18n/index.js'

const FILE_ICONS: Record<string, string> = {
  xlsx: '📊', xls: '📊', csv: '📊',
  doc: '📝', docx: '📝',
  ppt: '📽', pptx: '📽',
  pdf: '📕',
  zip: '📦', rar: '📦', '7z': '📦',
  mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
  mp3: '🎵', wav: '🎵', flac: '🎵',
}

function getIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_ICONS[ext] || '📎'
}

function isVideo(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)
}

export const FileEmbed = createReactBlockSpec(
  {
    type: 'fileEmbed' as const,
    propSchema: {
      src: { default: '' },
      fileName: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const api = useBanjuanAPI()
      const t = useT()
      const { src, fileName } = props.block.props
      const [resolvedUrl, setResolvedUrl] = React.useState<string>('')

      React.useEffect(() => {
        if (!src) return
        let cancelled = false
        // Where banjuan-attachment:// isn't served (iPad), ask for a loadable URL.
        if (api.attachments.getFileSrc) {
          api.attachments.getFileSrc(src).then(u => { if (!cancelled) setResolvedUrl(u) }).catch(() => {})
        } else {
          setResolvedUrl(`banjuan-attachment://${src}`)
        }
        return () => { cancelled = true }
      }, [src])

      const handleOpen = () => {
        if (src) api.attachments.open(src)
      }

      if (isVideo(fileName) && resolvedUrl) {
        return (
          <div contentEditable={false} style={{ margin: '8px 0' }}>
            <video
              src={resolvedUrl}
              controls
              style={{ maxWidth: '100%', borderRadius: 6 }}
            />
            <div
              onDoubleClick={handleOpen}
              style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, cursor: 'pointer' }}
            >
              🎬 {fileName}
            </div>
          </div>
        )
      }

      return (
        <div
          contentEditable={false}
          onDoubleClick={handleOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', margin: '4px 0',
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--surface)', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 20 }}>{getIcon(fileName)}</span>
          <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName || t('embed.attachment')}
          </span>
        </div>
      )
    },
  }
)()
