import { useState, useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'banjuan-pdf-eye-protection'
const TINT_COLOR = 'rgba(245, 220, 180, 0.25)'

let listeners: Array<() => void> = []

function getSnapshot(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
}

function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => { listeners = listeners.filter(l => l !== cb) }
}

function setStored(on: boolean) {
  try { localStorage.setItem(STORAGE_KEY, String(on)) } catch {}
  listeners.forEach(cb => cb())
}

export function useEyeProtection() {
  const on = useSyncExternalStore(subscribe, getSnapshot, () => false)
  const toggle = useCallback(() => setStored(!getSnapshot()), [])
  const setOn = useCallback((v: boolean) => setStored(v), [])
  return { eyeProtection: on, toggleEyeProtection: toggle, setEyeProtection: setOn }
}

export const EYE_PROTECTION_TINT = TINT_COLOR
