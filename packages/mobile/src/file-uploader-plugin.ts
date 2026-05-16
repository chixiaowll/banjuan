import { registerPlugin } from '@capacitor/core'

export interface FileUploaderPlugin {
  upload(options: {
    filePath: string
    serverUrl: string
    method?: string
    headers?: Record<string, string>
  }): Promise<{ status: number }>
}

export const FileUploader = registerPlugin<FileUploaderPlugin>('FileUploader')
