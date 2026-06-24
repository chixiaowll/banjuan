import { describe, it, expect } from 'vitest'
import { reconcileFile, type ReconcileInput } from './reconcile.js'

const base: ReconcileInput = {
  localPresent: true, remotePresent: true,
  localChanged: false, remoteChanged: false,
  hadArchive: true, remoteReliable: true, localReliable: true,
}
const I = (o: Partial<ReconcileInput>): ReconcileInput => ({ ...base, ...o })

describe('reconcileFile — both present', () => {
  it('neither changed → skip (fixes the spurious ↑re-upload)', () => {
    expect(reconcileFile(I({}))).toBe('skip')
  })
  it('only local changed → upload', () => {
    expect(reconcileFile(I({ localChanged: true }))).toBe('upload')
  })
  it('only remote changed → download', () => {
    expect(reconcileFile(I({ remoteChanged: true }))).toBe('download')
  })
  it('both changed → conflict', () => {
    expect(reconcileFile(I({ localChanged: true, remoteChanged: true }))).toBe('conflict')
  })
})

describe('reconcileFile — deletions (gated by archive)', () => {
  it('remote gone, local untouched, had archive → delete local', () => {
    expect(reconcileFile(I({ remotePresent: false }))).toBe('deleteLocal')
  })
  it('local gone, remote untouched, had archive → delete remote', () => {
    expect(reconcileFile(I({ localPresent: false }))).toBe('deleteRemote')
  })
  it('remote gone but local edited → resurrect via upload (never lose an edit)', () => {
    expect(reconcileFile(I({ remotePresent: false, localChanged: true }))).toBe('upload')
  })
  it('local gone but remote edited → resurrect via download', () => {
    expect(reconcileFile(I({ localPresent: false, remoteChanged: true }))).toBe('download')
  })
})

describe('reconcileFile — new files (no archive ⇒ never delete)', () => {
  it('local only, no archive → upload (new), not delete', () => {
    expect(reconcileFile(I({ remotePresent: false, hadArchive: false }))).toBe('upload')
  })
  it('remote only, no archive → download (new), not delete', () => {
    expect(reconcileFile(I({ localPresent: false, hadArchive: false }))).toBe('download')
  })
})

describe('reconcileFile — unreliable listing ⇒ never delete', () => {
  it('remote listing unreliable + remote absent → skip (no mass-delete on empty/failed PROPFIND)', () => {
    expect(reconcileFile(I({ remotePresent: false, remoteReliable: false }))).toBe('skip')
  })
  it('local listing unreliable + local absent → skip', () => {
    expect(reconcileFile(I({ localPresent: false, localReliable: false }))).toBe('skip')
  })
  it('unreliable remote does not block a normal both-present download', () => {
    // both present, remote changed — remoteReliable false shouldn’t matter here
    expect(reconcileFile(I({ remoteChanged: true, remoteReliable: false }))).toBe('download')
  })
})
