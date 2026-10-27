import React, { useEffect, useState } from 'react'
import { useBanjuanAPI } from '../api.js'
import { useT } from '../i18n/index.js'

/** Settings row: show the app in the Dock as well as the menu bar (macOS). Renders nothing elsewhere. */
export function DockSetting() {
  const api = useBanjuanAPI()
  const t = useT()
  const mb = api.menuBar
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    if (!mb) return
    mb.getShowInDock().then(setShow).catch(() => {})
    return mb.onShowInDockChanged(setShow)   // also switched from the menu bar menu
  }, [mb])

  if (!mb || show === null) return null

  return (
    <div style={{ fontSize: 13, marginBottom: 28 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          data-show-in-dock
          checked={show}
          onChange={(e) => { const v = e.target.checked; setShow(v); void mb.setShowInDock(v).then(setShow) }}
        />
        <span>{t('settings.showInDock')}</span>
      </label>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>{t('settings.showInDockHint')}</div>
    </div>
  )
}
