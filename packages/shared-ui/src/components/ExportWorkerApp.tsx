import { useEffect, useRef } from 'react'
import { BlockNoteEditor } from '@blocknote/core'
import { useBanjuanAPI } from '../api.js'
import { schema as blockNoteSchema } from './notes/BlockEditor.js'
import { resolveExportNotes, buildExportEntries } from '../utils/exportEntries.js'
import { exportToDirectory, type ExportObserver } from '../utils/exportToDirectory.js'
import type { BatchExportJob } from '../api.js'
import MindmapExportHost from './MindmapExportHost.js'

/**
 * Root component for the hidden background export window (loaded at
 * `index.html#export-worker`). It owns no visible UI — it waits for an export
 * job, runs the full export loop here (so all heavy mindmap rendering and
 * html-to-image rasterization stay off the visible window's process), and
 * reports progress back over IPC.
 */
export default function ExportWorkerApp() {
  const api = useBanjuanAPI()
  const queueRef = useRef<BatchExportJob[]>([])
  const drainingRef = useRef(false)

  useEffect(() => {
    if (!api.batchExport) return
    const be = api.batchExport

    const runJob = async (job: BatchExportJob) => {
      // Progress is namespaced by the job's runId so the visible panel can
      // address the right item even across accumulated/concurrent runs.
      const observer: ExportObserver = {
        onStart: () => { /* the visible window already populated its panel */ },
        onItem: (id, status, error) => be.workerProgress({ runId: job.runId, id, status, error }),
        onDone: () => { /* drained-level done is reported below */ },
      }
      const editor = BlockNoteEditor.create({ schema: blockNoteSchema } as any)
      const notes = await resolveExportNotes(api, job)
      const entries = buildExportEntries(api, notes, job.format, editor, { pageIndex: job.pageIndex })
      await exportToDirectory(api, entries, job.format, { outputDir: job.outputDir, observer })
    }

    const drain = async () => {
      if (drainingRef.current) return
      drainingRef.current = true
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift()!
        try { await runJob(job) } catch { /* skip failed job, keep draining */ }
      }
      drainingRef.current = false
      // Re-check in case a job arrived during the final iteration.
      if (queueRef.current.length > 0) { drain(); return }
      be.workerDone()
    }

    const off = be.workerOnJob((job) => {
      queueRef.current.push(job)
      drain()
    })

    be.workerReady()
    return off
  }, [api])

  return <MindmapExportHost />
}
