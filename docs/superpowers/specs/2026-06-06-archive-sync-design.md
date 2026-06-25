# Archive-based Sync (hash-truth, Unison-style) — Design

Date: 2026-06-06
Status: P1 in progress

## Problem

LAN/WebDAV file sync decided upload/download by comparing **local mtime vs remote
mtime**. On mobile (CapacitorFS) there is **no API to set a file's mtime**, so a
downloaded file keeps its *write time*, which is newer than the remote's mtime.
Next sync therefore re-uploads every just-downloaded file (`↓0 ↑24`). Desktop
(NodeFS `utimesSync`) hid the bug by restoring mtime on download.

Root cause: comparing the two replicas' mtimes directly is unreliable when mtime
can't be preserved.

## Industry basis

- **Unison**: keep an *archive* = state at last successful sync; detect "changed"
  per side as *current vs archive* (not replica-vs-replica); propagate
  non-conflicting; flag conflicts; suppress *false conflicts* (both changed but
  identical content).
- **rsync `--checksum`**: when mtime is unreliable, use content hash.
- **Syncthing**: SHA-256 + conflict copies (`*.sync-conflict-…`), zero data loss.
- **CouchDB/PouchDB**: deterministic winner (NOT timestamps); never lose data;
  deletes are tombstones.

Our LAN topology is **hub-and-spoke** (host serves the library; each client syncs
against it). That is Unison's **2-replica + archive** model per client↔host pair —
simpler than version vectors and sufficient.

## Model

Per client, an **archive** describing the state at the last successful sync:

```jsonc
// .banjuan/sync-archive.json
{
  "version": 2,
  "files": {
    "<relpath>": {
      "sig": "h:<sha256> | a:<size>:<mtime>",  // content signature (hash if crypto, else size:mtime)
      "size": 1234,
      "mtime": 500,          // local mtime at last sync — cheap re-hash pre-filter
      "remoteMtime": 1700    // remote mtime at last sync — remote-change signal
    }
  }
}
```

`sig` is the source of truth for "did this side change". `size`+`mtime` are a cheap
pre-filter so unchanged files are never re-hashed. `remoteMtime` is the remote
change signal (ETag later, P3).

## Per-file change detection (each side vs archive)

- **localChanged**: if `(size,mtime)` equal archive → unchanged (skip hashing,
  reuse archive.sig). Else compute sig; `localChanged = sig !== archive.sig`.
- **remoteChanged**: `remoteMtime !== archive.remoteMtime`.
- No archive entry → that side is "new/unknown" (never a basis for deletion).

## Decision matrix (pure, unit-tested)

Both present:

| local | remote | action |
|---|---|---|
| unchanged | unchanged | skip |
| changed | unchanged | upload |
| unchanged | changed | download |
| changed | changed | **conflict** (P1: host-wins download + count/log; P2: conflict copy) |

One side present (deletion), gated by archive:

| local | remote | archive | action |
|---|---|---|---|
| present | absent | yes, local unchanged | delete local (remote deleted) |
| absent | present | yes, remote unchanged | delete remote (local deleted) |
| present | absent | yes, local changed | upload (resurrect — never lose an edit) |
| absent | present | yes, remote changed | download (resurrect) |
| present | absent | **no archive** | upload (new) — never delete |
| absent | present | **no archive** | download (new) — never delete |

## Safety rules (mandatory, unit-tested)

1. **No archive entry ⇒ never delete.** A fresh device can't wipe a peer.
2. **Empty/failed listing ⇒ skip all deletions.** If a side's listing is empty (or
   the remote fetch failed) while the archive had many files, treat as
   "no data, can't reconcile deletions" and skip every delete. (Generalizes the
   existing `remoteFiles.length===0 && snapshot>0` guard.)

## Conflict UX (P2+)

Loser saved as `name.sync-conflict-<ts>-<deviceId>.ext` with frontmatter
`{ conflictOf, conflictDevice, conflictAt }` (new id). Surfaced via: post-sync
count/toast, a "Conflicts" inbox, and a banner on the affected note linking to a
side-by-side compare with keep-mine / keep-theirs / keep-both. Binary documents:
keep both files only. Resolution writes the winner and deletes the copy (normal
delete path). Deterministic canonical winner = **remote (host) keeps the name**,
local becomes the copy — both ends converge without coordination.

## Migration (v1 snapshot → v2 archive)

First sync after upgrade: for files present on both sides, **assume in-sync** —
seed the archive (compute sig, record remoteMtime), transfer nothing (kills the
`↑24` immediately). Use the old `files[]` list for deletion decisions that one
time. Then everything is v2.

## Cost

No-op sync: read size/mtime only — zero hashing, zero transfer. Changed files
only: hash the few whose `(size,mtime)` moved.

## Implementation phases

- **P1**: archive + signature detection (size/mtime pre-filter, hash when crypto
  present) + 3-way propagation + the two deletion safety rules. Conflict =
  host-wins + count/log. Pure `reconcile()` with unit tests.
- **P2**: `.sync-conflict` copies + Conflicts inbox/compare UI.
- **P3**: LAN host returns content sha256 as ETag → exact remote-change + content
  equality (false-conflict suppression) without downloading.

## Long term

Field-level conflict-free note merge via cr-sqlite CRDT; this archive sync is the
stable bridge until then.
