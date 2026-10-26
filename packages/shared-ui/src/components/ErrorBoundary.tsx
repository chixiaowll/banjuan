import React from 'react'
import { useT } from '../i18n/index.js'

interface Props {
  /** What to show instead after a render error; default: a short notice with a retry button. */
  fallback?: (retry: () => void) => React.ReactNode
  /** Changing this clears a caught error (e.g. the content that failed changed). */
  resetKey?: unknown
  children: React.ReactNode
}

/**
 * Contains a render error to the view that threw. Without one, any error
 * (an unknown block type in a preview, a bad record) unmounted the whole
 * window and left it blank. Nothing is lost: saved data is untouched.
 */
export default class ErrorBoundary extends React.Component<Props, { error: Error | null; resetKey: unknown }> {
  state = { error: null as Error | null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; resetKey: unknown }) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] view crashed', error, info.componentStack)
  }

  private retry = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return this.props.fallback ? this.props.fallback(this.retry) : <CrashNotice onRetry={this.retry} />
  }
}

function CrashNotice({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
      <div>{t('error.viewCrashed')}</div>
      <button onClick={onRetry} style={{ border: '1px solid var(--border)', background: 'var(--surface-raised, transparent)', color: 'var(--text)', borderRadius: 6, padding: '4px 14px', cursor: 'pointer', fontSize: 13 }}>
        {t('error.retry')}
      </button>
    </div>
  )
}
