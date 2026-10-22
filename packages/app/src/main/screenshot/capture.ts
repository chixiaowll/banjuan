import { desktopCapturer, systemPreferences, dialog, shell, type Display } from 'electron'
import { execFile } from 'node:child_process'
import type { RawWindow } from './pure.js'

export interface Capture { bitmap: Buffer; pixelWidth: number; pixelHeight: number }

/** One display at native resolution, as raw BGRA pixels (toBitmap ≈3ms vs toPNG ≈240ms). */
export async function captureDisplay(display: Display): Promise<Capture> {
  const width = Math.round(display.bounds.width * display.scaleFactor)
  const height = Math.round(display.bounds.height * display.scaleFactor)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
  if (sources.length === 0) throw new Error('No screen source available')
  const src = sources.find(s => String(s.display_id) === String(display.id)) ?? sources[0]
  const size = src.thumbnail.getSize()
  return { bitmap: src.thumbnail.toBitmap(), pixelWidth: size.width, pixelHeight: size.height }
}

// On-screen, normal-layer, visible windows (global points, frontmost first).
const WINDOW_LIST_JXA = `
ObjC.import('CoreGraphics'); ObjC.import('Foundation');
var arr = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID));
var out = [];
for (var i = 0; i < arr.count; i++) {
  var w = arr.objectAtIndex(i);
  if (ObjC.unwrap(w.objectForKey('kCGWindowLayer')) !== 0) continue;
  if (ObjC.unwrap(w.objectForKey('kCGWindowAlpha')) === 0) continue;
  var b = w.objectForKey('kCGWindowBounds');
  out.push([ObjC.unwrap(b.objectForKey('X')), ObjC.unwrap(b.objectForKey('Y')), ObjC.unwrap(b.objectForKey('Width')), ObjC.unwrap(b.objectForKey('Height')), ObjC.unwrap(w.objectForKey('kCGWindowOwnerName')) || '']);
}
JSON.stringify(out)`

/** Window rects for click-to-select. macOS only; anything else (or any failure) → no windows. */
export function listWindows(): Promise<RawWindow[]> {
  if (process.platform !== 'darwin') return Promise.resolve([])
  return new Promise(resolve => {
    execFile('osascript', ['-l', 'JavaScript', '-e', WINDOW_LIST_JXA], { timeout: 2000 }, (err, stdout) => {
      if (err) { console.warn('[screenshot] window list unavailable', err.message); resolve([]); return }
      try {
        resolve((JSON.parse(stdout) as Array<[number, number, number, number, string]>).map(([x, y, w, h, owner]) => ({ x, y, w, h, owner })))
      } catch {
        resolve([])
      }
    })
  })
}

export function hasScreenPermission(): boolean {
  return process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('screen') === 'granted'
}

/** macOS Screen Recording permission prompt (kept from the previous implementation). */
export function promptScreenPermission(): void {
  void dialog.showMessageBox({
    type: 'info',
    message: 'Screen Recording permission needed',
    detail: 'Enable Screen Recording for banjuan in System Settings → Privacy & Security, then try again.',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  })
}

/**
 * The first getSources of a process takes 500–900ms; one tiny call at startup
 * makes the first real screenshot ≈270ms. Only with permission already granted
 * — otherwise this call itself would pop the system permission dialog.
 */
export async function warmUpCapturer(): Promise<void> {
  if (!hasScreenPermission()) return
  try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 16, height: 16 } }) } catch { /* best effort */ }
}
