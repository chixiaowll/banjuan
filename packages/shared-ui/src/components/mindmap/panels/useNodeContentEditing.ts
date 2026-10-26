import { useCallback, useEffect, useRef, useState } from 'react'
import { useMindmapStore } from '../useMindmapStore.js'
import { useDebouncedSaver } from '../../../utils/debouncedSaver.js'

/**
 * Title + content editing of one mind-map node in a side panel.
 *
 * Typing used to write the node on every keystroke — one undo step and one
 * full rewrite of the map file per character. Edits are now written after a
 * short pause (and on close / switching nodes / quitting). And when the node
 * changes from elsewhere while the panel is open (undo, another editor, a sync)
 * with nothing pending here, the editor reloads instead of later saving its
 * stale copy over the change.
 */
export function useNodeContentEditing(nodeId: string | null) {
  const node = useMindmapStore(s => (nodeId ? s.rfNodes.find(n => n.id === nodeId) : undefined))
  const updateNodeData = useMindmapStore(s => s.updateNodeData)
  const saver = useDebouncedSaver(600, nodeId)
  const pending = useRef<{ title?: string; content?: string }>({})

  const storeTitle = (node?.data.title as string | undefined) ?? ''
  const storeContent = (node?.data.content as string | null | undefined) ?? ''
  const [title, setTitleState] = useState(storeTitle)
  // What the editor shows: loaded from the node, or typed here.
  const editorContent = useRef(storeContent)
  const [editorKey, setEditorKey] = useState(0)

  const shownNodeId = useRef(nodeId)
  useEffect(() => {
    if (shownNodeId.current === nodeId) return
    shownNodeId.current = nodeId   // (the saver already flushed the previous node's edits)
    pending.current = {}
    setTitleState(storeTitle)
    editorContent.current = storeContent
    setEditorKey(k => k + 1)
  }, [nodeId])

  useEffect(() => {
    if (saver.hasPending || storeContent === editorContent.current) return
    editorContent.current = storeContent
    setEditorKey(k => k + 1)
  }, [storeContent])

  useEffect(() => {
    if (!saver.hasPending) setTitleState(storeTitle)
  }, [storeTitle])

  const schedule = useCallback(() => {
    const id = nodeId
    if (!id) return
    saver.schedule(() => {
      const updates = pending.current
      pending.current = {}
      if (Object.keys(updates).length) void updateNodeData(id, updates)
    })
  }, [nodeId, saver, updateNodeData])

  const setTitle = useCallback((value: string) => {
    setTitleState(value)
    pending.current.title = value
    schedule()
  }, [schedule])

  const onContentChange = useCallback((json: string) => {
    editorContent.current = json
    pending.current.content = json
    schedule()
  }, [schedule])

  return { node, title, setTitle, initialContent: editorContent.current, editorKey, onContentChange }
}
