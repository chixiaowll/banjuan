import { useState, useEffect, useCallback } from 'react'
import { useBanjuanAPI } from '../api.js'

interface Annotation {
  id: string
  docId: string
  type: string
  page: number | null
  position: any
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
  updatedAt: string
}

interface CreateInput {
  docId: string
  type: string
  page?: number
  position: unknown
  content?: string
  selectedText?: string
  color?: string
}

export function useAnnotations(docId: string) {
  const api = useBanjuanAPI()
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const list = await api.annotations.list({ docId })
    setAnnotations(list)
    setLoading(false)
  }, [docId])

  useEffect(() => { reload() }, [reload])

  const create = useCallback(async (input: Omit<CreateInput, 'docId'>) => {
    const ann = await api.annotations.create({ ...input, docId } as any)
    await reload()
    return ann
  }, [docId, reload])

  const update = useCallback(async (id: string, updates: { content?: string; color?: string; position?: unknown }) => {
    const ann = await api.annotations.update(id, updates)
    await reload()
    return ann
  }, [reload])

  const remove = useCallback(async (id: string) => {
    await api.annotations.delete(id)
    await reload()
  }, [reload])

  return { annotations, loading, create, update, remove, reload }
}
