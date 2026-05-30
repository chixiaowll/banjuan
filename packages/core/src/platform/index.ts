import type { PlatformFS } from './fs.js'
import type { DatabaseFactory } from './database.js'
import type { PlatformCrypto } from './crypto.js'

export type { PlatformFS } from './fs.js'
export type { PlatformDatabase, DatabaseFactory } from './database.js'
export type { PlatformCrypto } from './crypto.js'
export * from './path.js'

export interface PlatformDeps {
  fs: PlatformFS
  dbFactory: DatabaseFactory
  crypto: PlatformCrypto
  /**
   * Optional global plugins directory (e.g. ~/.banjuan/plugins), shared across
   * all libraries — the install location for built-in/global plugins. Loaded in
   * addition to each library's local .banjuan/plugins.
   */
  globalPluginsDir?: string
}
