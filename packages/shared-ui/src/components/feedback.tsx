import React, { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useT } from '../i18n/index.js'

/**
 * App-wide feedback: toasts and promise-based dialogs replacing window.alert /
 * confirm / prompt (prompt() doesn't even work in Electron; the native ones
 * also block the renderer and ignore the theme). Callable from anywhere — not
 * just components — once <FeedbackHost /> is mounted at the app root.
 */

type ToastKind = 'info' | 'success' | 'error'
interface ToastItem { id: number; kind: ToastKind; message: string }

interface DialogRequest {
  id: number
  kind: 'alert' | 'confirm' | 'prompt'
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  defaultValue?: string
  placeholder?: string
  resolve: (value: unknown) => void
}

interface FeedbackState {
  toasts: ToastItem[]
  dialogs: DialogRequest[]
}

const useFeedbackStore = create<FeedbackState>(() => ({ toasts: [], dialogs: [] }))
let nextId = 1

function pushToast(kind: ToastKind, message: string, ms: number): void {
  const id = nextId++
  useFeedbackStore.setState(s => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }))
  setTimeout(() => dismissToast(id), ms)
}

function dismissToast(id: number): void {
  useFeedbackStore.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}

export const toast = {
  info: (message: string) => pushToast('info', message, 3500),
  success: (message: string) => pushToast('success', message, 3500),
  /** Errors stay longer — the user needs time to read what went wrong. */
  error: (message: string) => pushToast('error', message, 7000),
}

function openDialog<T>(req: Omit<DialogRequest, 'id' | 'resolve'>): Promise<T> {
  return new Promise<T>(resolve => {
    const id = nextId++
    useFeedbackStore.setState(s => ({ dialogs: [...s.dialogs, { ...req, id, resolve: resolve as (v: unknown) => void }] }))
  })
}

function closeDialog(id: number, value: unknown): void {
  const d = useFeedbackStore.getState().dialogs.find(x => x.id === id)
  useFeedbackStore.setState(s => ({ dialogs: s.dialogs.filter(x => x.id !== id) }))
  d?.resolve(value)
}

export interface DialogOptions {
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** Destructive action: the confirm button is red. */
  danger?: boolean
}

/** Resolves true on confirm, false on cancel / Esc / backdrop click. */
export function confirmDialog(opts: DialogOptions): Promise<boolean> {
  return openDialog<boolean>({ kind: 'confirm', ...opts })
}

/** A message the user must acknowledge (e.g. a list of failed imports). */
export function alertDialog(opts: Omit<DialogOptions, 'cancelText' | 'danger'>): Promise<void> {
  return openDialog<void>({ kind: 'alert', ...opts })
}

/** Resolves the entered text, or null on cancel. */
export function promptDialog(opts: DialogOptions & { defaultValue?: string; placeholder?: string }): Promise<string | null> {
  return openDialog<string | null>({ kind: 'prompt', ...opts })
}

const TOAST_ACCENT: Record<ToastKind, string> = { info: 'var(--accent)', success: '#2f9e44', error: '#c0392b' }

function Dialog({ d }: { d: DialogRequest }) {
  const t = useT()
  const [value, setValue] = useState(d.defaultValue ?? '')
  const confirmRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelValue = d.kind === 'confirm' ? false : d.kind === 'prompt' ? null : undefined
  const submit = () => closeDialog(d.id, d.kind === 'confirm' ? true : d.kind === 'prompt' ? value : undefined)
  const cancel = () => closeDialog(d.id, cancelValue)

  useEffect(() => {
    if (d.kind === 'prompt') { inputRef.current?.focus(); inputRef.current?.select() }
    else confirmRef.current?.focus()
    // Capture phase + stopPropagation: Esc/Enter belong to the dialog, not to
    // the editor or tab shortcuts underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
      else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const button: React.CSSProperties = { padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }
  return (
    <div onMouseDown={cancel} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--surface-raised, #fff)', color: 'var(--text)', borderRadius: 10, padding: 22, width: 380, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        {d.title && <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>{d.title}</h3>}
        {/* Without a title the message is the headline, so it gets full contrast. */}
        {d.message && <div style={{ fontSize: d.title ? 13 : 14, lineHeight: 1.6, color: d.title ? 'var(--text-muted)' : 'var(--text)', whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{d.message}</div>}
        {d.kind === 'prompt' && (
          <input ref={inputRef} value={value} placeholder={d.placeholder} onChange={e => setValue(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg, #fff)', color: 'var(--text)', outline: 'none' }} />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          {d.kind !== 'alert' && <button onClick={cancel} style={button}>{d.cancelText ?? t('common.cancel')}</button>}
          <button ref={confirmRef} onClick={submit}
            style={{ ...button, border: 'none', color: '#fff', background: d.danger ? '#c0392b' : 'var(--accent)' }}>
            {d.confirmText ?? (d.kind === 'alert' ? t('common.ok') : t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Mount once at the app root (inside the i18n/theme providers). */
export function FeedbackHost() {
  const toasts = useFeedbackStore(s => s.toasts)
  const dialog = useFeedbackStore(s => s.dialogs[0])   // one at a time, in order
  return (
    <>
      {dialog && <Dialog key={dialog.id} d={dialog} />}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 10001, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} onClick={() => dismissToast(t.id)}
              style={{ pointerEvents: 'auto', cursor: 'pointer', maxWidth: 480, padding: '9px 14px', fontSize: 13, lineHeight: 1.5, borderRadius: 8, whiteSpace: 'pre-wrap',
                background: 'var(--surface-raised, #fff)', color: 'var(--text)', border: '1px solid var(--border)', borderLeft: `3px solid ${TOAST_ACCENT[t.kind]}`, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
