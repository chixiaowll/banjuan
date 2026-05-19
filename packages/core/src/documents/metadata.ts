import { basename, extname } from '../platform/path.js'
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
  '.sh': 'txt',
  '.bash': 'txt',
  '.zsh': 'txt',
  '.yaml': 'txt',
  '.yml': 'txt',
  '.json': 'txt',
  '.xml': 'txt',
  '.csv': 'txt',
  '.tsv': 'txt',
  '.log': 'txt',
  '.conf': 'txt',
  '.cfg': 'txt',
  '.ini': 'txt',
  '.toml': 'txt',
  '.env': 'txt',
  '.py': 'txt',
  '.js': 'txt',
  '.ts': 'txt',
  '.jsx': 'txt',
  '.tsx': 'txt',
  '.css': 'txt',
  '.scss': 'txt',
  '.less': 'txt',
  '.sql': 'txt',
  '.rb': 'txt',
  '.go': 'txt',
  '.rs': 'txt',
  '.java': 'txt',
  '.c': 'txt',
  '.cpp': 'txt',
  '.h': 'txt',
  '.swift': 'txt',
  '.kt': 'txt',
  '.r': 'txt',
  '.tex': 'txt',
  '.bib': 'txt',
  '.rst': 'txt',
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
