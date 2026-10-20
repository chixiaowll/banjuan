import React, { useEffect, useState } from 'react'
import { useBanjuanAPI } from '../api.js'
import { useT } from '../i18n/index.js'
import { acceleratorFromKeyEvent, formatAccelerator } from '../utils/accelerator.js'

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)

type HotkeyState = { hotkey: string; registered: boolean }

/** Settings row for the desktop screenshot hotkey. Renders nothing where unsupported (mobile). */
export function ScreenshotHotkeySetting() {
  const api = useBanjuanAPI()
  const t = useT()
  const ss = api.screenshot
  const [state, setState] = useState<HotkeyState | null>(null)
  const [recording, setRecording] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => { ss?.getHotkey?.().then(setState).catch(() => {}) }, [ss])

  const apply = async (accel: string) => {
    if (!ss?.setHotkey) return
    const r = await ss.setHotkey(accel)
    setState({ hotkey: r.hotkey, registered: r.registered })
    setFailed(!r.ok)
  }

  // While recording, swallow every keydown in the capture phase so no app
  // shortcut fires; commit on the first complete combo, Esc cancels.
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) { setRecording(false); return }
      const accel = acceleratorFromKeyEvent(e, IS_MAC)
      if (!accel) return
      setRecording(false)
      void apply(accel)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  if (!ss?.getHotkey || !ss.setHotkey || !state) return null

  const warn = failed || !state.registered
  const message = failed ? t('settings.hotkeyFailed') : !state.registered ? t('settings.hotkeyNotRegistered') : t('settings.hotkeyHint')
  const linkStyle: React.CSSProperties = { fontSize: 12, padding: 0, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }

  return (
    <div style={{ fontSize: 13, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{t('settings.screenshotHotkey')}</span>
        <kbd style={{
          fontSize: 13, padding: '4px 10px', borderRadius: 4, fontFamily: recording ? 'inherit' : 'var(--font-mono, monospace)',
          border: `1px solid ${recording ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)', color: recording ? 'var(--accent)' : 'var(--text)',
        }}>
          {recording ? t('settings.hotkeyRecording') : formatAccelerator(state.hotkey, IS_MAC)}
        </kbd>
        {!recording && (<>
          <button onClick={() => { setFailed(false); setRecording(true) }} style={linkStyle}>{t('settings.hotkeyChange')}</button>
          <button onClick={() => void apply('')} style={linkStyle}>{t('settings.hotkeyReset')}</button>
        </>)}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: warn ? '#c0392b' : 'var(--text-muted)' }}>{message}</div>
    </div>
  )
}
