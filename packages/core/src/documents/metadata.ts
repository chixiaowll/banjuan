import { basename, extname } from 'node:path'
import type { DocumentType } from '../types.js'

const EXT_TO_TYPE: Record<string, DocumentType> = {
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.html': 'html',
  '.htm': 'html',
}

export function detectDocumentType(filePath: string): DocumentType {
  const ext = extname(filePath).toLowerCase()
  return EXT_TO_TYPE[ext] ?? 'other'
}

export function extractTitle(filePath: string): string {
  const name = basename(filePath)
  const ext = extname(name)
  return name.slice(0, name.length - ext.length)
}
