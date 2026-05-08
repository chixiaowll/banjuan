export interface PlatformFS {
  readFile(path: string): Promise<Uint8Array>
  readTextFile(path: string): Promise<string>
  writeFile(path: string, data: Uint8Array): Promise<void>
  writeTextFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  readdir(path: string): Promise<string[]>
  readdirWithTypes(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  remove(path: string): Promise<void>
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>
  stat(path: string): Promise<{ mtime: number; size: number }>
  rename(from: string, to: string): Promise<void>
  watch?(path: string, options: { recursive?: boolean }, callback: (event: string, filename: string | null) => void): { close(): void }
}
