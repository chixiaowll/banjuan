// Pure reconciliation for archive-based sync (Unison-style 2-replica + archive).
//
// Each side's "changed?" is decided as *current vs archive* (the state at the
// last successful sync), NOT replica-vs-replica — this is what makes it correct
// when local mtime can't be preserved (mobile). See
// docs/superpowers/specs/2026-06-06-archive-sync-design.md.

export type SyncAction =
  | 'skip'
  | 'upload'
  | 'download'
  | 'deleteLocal'
  | 'deleteRemote'
  | 'conflict' // both sides changed; caller decides resolution (P1: host-wins download)

export interface ReconcileInput {
  localPresent: boolean
  remotePresent: boolean
  /** current local signature differs from the archived one (false when unchanged) */
  localChanged: boolean
  /** current remote signal differs from the archived one */
  remoteChanged: boolean
  /** an archive entry existed for this path (proves it was synced before) */
  hadArchive: boolean
  /** false when the remote listing is empty/failed and can't be trusted */
  remoteReliable: boolean
  /** false when the local listing is empty/failed and can't be trusted */
  localReliable: boolean
}

/**
 * Decide the action for a single path. Pure and total.
 *
 * Safety invariants (see spec §Safety):
 *  1. No archive entry ⇒ never delete (a fresh device can't wipe a peer).
 *  2. A side whose listing is unreliable ⇒ never delete or act on its "absence".
 */
export function reconcileFile(i: ReconcileInput): SyncAction {
  const { localPresent, remotePresent, localChanged, remoteChanged, hadArchive } = i

  if (localPresent && remotePresent) {
    if (!localChanged && !remoteChanged) return 'skip'
    if (localChanged && !remoteChanged) return 'upload'
    if (!localChanged && remoteChanged) return 'download'
    return 'conflict'
  }

  if (localPresent && !remotePresent) {
    // We only trust "remote is absent" when the remote listing is reliable.
    if (!i.remoteReliable) return 'skip'
    if (!hadArchive) return 'upload'        // new local file
    if (localChanged) return 'upload'       // remote deleted but local edited → resurrect
    return 'deleteLocal'                    // remote deleted, local untouched → honor it
  }

  if (!localPresent && remotePresent) {
    if (!i.localReliable) return 'skip'
    if (!hadArchive) return 'download'      // new remote file
    if (remoteChanged) return 'download'    // local deleted but remote edited → resurrect
    return 'deleteRemote'                   // local deleted, remote untouched → honor it
  }

  return 'skip' // neither side has it
}
