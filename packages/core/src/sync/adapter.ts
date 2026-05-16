import type { SyncConfig, RemoteFile } from '../types.js'

export interface DownloadProgress {
  loaded: number
  total: number
}

export interface SyncAdapter {
  connect(config: SyncConfig): Promise<void>
  disconnect(): Promise<void>
  list(remotePath: string): Promise<RemoteFile[]>
  upload(localPath: string, remotePath: string): Promise<void>
  download(remotePath: string, localPath: string, onProgress?: (p: DownloadProgress) => void): Promise<void>
  delete(remotePath: string): Promise<void>
  getMetadata(remotePath: string): Promise<{ mtime: number; size: number }>
  mkdir(remotePath: string): Promise<void>
}
