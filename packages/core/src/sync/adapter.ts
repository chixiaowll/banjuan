import type { SyncConfig, RemoteFile } from '../types.js'

export interface SyncAdapter {
  connect(config: SyncConfig): Promise<void>
  disconnect(): Promise<void>
  list(remotePath: string): Promise<RemoteFile[]>
  upload(localPath: string, remotePath: string): Promise<void>
  download(remotePath: string, localPath: string): Promise<void>
  delete(remotePath: string): Promise<void>
  getMetadata(remotePath: string): Promise<{ mtime: number; size: number }>
  mkdir(remotePath: string): Promise<void>
}
