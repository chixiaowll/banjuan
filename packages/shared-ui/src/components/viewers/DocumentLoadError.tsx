import React from 'react'
import { useT } from '../../i18n/index.js'
import { errorMessage } from '../feedback.js'

/** A missing file surfaces as ENOENT from Node (desktop) or "not found" (Capacitor). */
export function isFileMissingError(err: unknown): boolean {
  return /ENOENT|no such file|not found|does not exist/i.test(String((err as any)?.message ?? err))
}

/**
 * Shown instead of an endless "Loading…" when a document can't be read or
 * parsed: says what went wrong and offers a retry.
 */
export default function DocumentLoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT()
  const detail = isFileMissingError(error) ? t('viewer.fileMissing') : errorMessage(error)
  return (
    <div role="alert" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 10, padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('viewer.loadFailed')}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.6, wordBreak: 'break-word' }}>{detail}</div>
      {onRetry && (
        <button onClick={onRetry} style={{
          marginTop: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
          border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text)',
        }}>{t('common.retry')}</button>
      )}
    </div>
  )
}
