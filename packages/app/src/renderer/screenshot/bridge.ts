import type { BanjuanAPI } from '@banjuan/shared-ui'

/** The preload bridge for the overlay and pin pages (all screenshot members exist on desktop). */
export type ScreenshotBridge = Required<NonNullable<BanjuanAPI['screenshot']>>
export const bridge: ScreenshotBridge = (window as any).electronAPI.screenshot
export type { ScreenshotSession, ScreenshotAction } from '@banjuan/shared-ui'
