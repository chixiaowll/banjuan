# 截图对标飞书 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把桌面端截图升级到飞书的水平：约 300ms 唤出、窗口识别与可调整的选区、8 种可编辑的标注、复制 / 保存 / 钉图 / 插入笔记、多显示器跟随。

**Architecture:** 主进程拆成 `src/main/screenshot/`（截屏 + 窗口列表、预热复用的浮层窗口、输出动作、快捷键、会话调度）；渲染端改为独立入口 `screenshot.html`（不加载主界面包），状态机 / 标注模型 / 撤销栈 / 合成都是纯函数模块并有单测，React 组件只负责组合与事件。截图位图以 BGRA 原始像素经 IPC 直传，浮层用 canvas 绘制。

**Tech Stack:** Electron 35（desktopCapturer、BrowserWindow、globalShortcut、dialog、clipboard、Menu）、React 19、Vite 多页面、vitest、lucide-react 图标、shared-ui 的 i18n 子模块。

设计文档：`docs/superpowers/specs/2026-10-22-screenshot-feishu-parity-design.md`。分支：`feat/screenshot-feishu`（基于 `integrate/local-test`）。

## 已验证的技术事实（写计划前在本机实测）

- `nativeImage.toBitmap()` 是 **BGRA**（纯红像素 → `0,0,255,255`），3024×1964 截图耗时 3ms；`toPNG()` 243ms。
- `desktopCapturer.getSources` 全尺寸首调 520–920ms、之后约 270ms；启动时用 16px 缩略图预热一次后，首次全尺寸截屏 266ms。没有屏幕录制权限时调用会弹系统授权框——**只在已授权时预热**。
- JXA 取窗口列表（`CGWindowListCopyWindowInfo`）约 150ms，返回全局点坐标、从前到后；与截屏并行。
- 隐藏后的窗口：默认设置下 rAF 不执行；`webPreferences.backgroundThrottling: false` 时 rAF 正常（8ms）——复用的浮层窗口必须关闭后台节流。

## 必须保留的稳定性约束

不透明浮层窗口、`setAlwaysOnTop(true, 'floating')`；`show: false` + 渲染端两帧 rAF 后发 `ready` 再显示，3 秒兜底显示；渲染崩溃 / 无响应时收起；暗色遮罩用 4 个矩形；拖拽用 pointer capture；工具栏限制在 workArea；文字输入框不能因画布 mousedown 失焦；快捷键默认 Ctrl+Shift+A、可在设置中修改。

## 文件结构

主进程（`packages/app/src/main/`）：

| 文件 | 职责 |
|---|---|
| `screenshot/pure.ts` (+ test) | 纯函数：窗口列表 → 显示器相对矩形、文件名、钉图缩放 |
| `screenshot/capture.ts` | 截屏位图、JXA 窗口列表、权限判断、预热 |
| `screenshot/hotkey.ts` | 全局快捷键注册 / 回滚 / 设置 IPC（从旧服务迁入） |
| `screenshot/overlay-window.ts` | 预热复用的浮层窗口：呈现会话、显示、隐藏重置、崩溃重建 |
| `screenshot/outputs.ts` | 复制、保存、钉图窗口及其 IPC |
| `screenshot/index.ts` | 会话调度、IPC、多屏跟随、对外 `initScreenshot` / `triggerCapture` / `disposeScreenshot` |
| `windows.ts`（改） | 记录最近聚焦的书房窗口；非 macOS 最后一个书房窗口关闭时退出 |
| `index.ts`（改） | 改为从 `./screenshot/index.js` 引入 |
| `screenshot-service.ts`（删） | 由上面的目录取代 |

渲染端（`packages/app/src/renderer/`）：

| 文件 | 职责 |
|---|---|
| `screenshot.html` / `screenshot.tsx` | 独立入口；`#pin` 渲染钉图，否则渲染浮层 |
| `screenshot/geometry.ts`（改，+ test） | 增加 `distToSegment`、`clampPoint`、`pointInRect` |
| `screenshot/bitmap.ts` (+ test) | BGRA→RGBA、取色与十六进制 |
| `screenshot/history.ts` (+ test) | 撤销 / 重做栈 |
| `screenshot/shapes.ts` (+ test) | 标注模型：包围盒、命中、平移、序号、绘制 |
| `screenshot/selection.ts` (+ test) | 选区状态机 |
| `screenshot/compose.ts` (+ test) | 设备像素裁切与合成 |
| `screenshot/prefs.ts` | 样式记忆（localStorage） |
| `screenshot/bridge.ts` | 带类型的 `window.electronAPI.screenshot` |
| `screenshot/Magnifier.tsx` | 放大镜 |
| `screenshot/Toolbar.tsx` | 工具栏 + 样式面板 |
| `screenshot/Overlay.tsx` | 浮层主组件 |
| `screenshot/Pin.tsx` | 钉图窗口 |
| `screenshot/ops.ts`、`ops.test.ts`、`views/ScreenshotOverlay.tsx`（删） | 由新模块取代 |
| `App.tsx`（改） | 去掉 `#screenshot-overlay` 路由 |

其他：`app/src/preload/index.ts`（截图 API）、`app/vite.config.ts`（多页面）、`shared-ui/src/api.ts`（类型）、`shared-ui/src/components/notes/BlockEditor.tsx`（`insertImage`）、`shared-ui/src/views/NoteView.tsx`（接收插入）、`shared-ui/src/components/TabManager.tsx`（插入目标、结果提示）、`shared-ui/src/i18n/*.ts`（文案）。

测试命令（在 `packages/app` 下）：`npx vitest run <文件>`；类型检查：`npx tsc --noEmit -p .`。

---

## 阶段 A：纯函数模块（全部 TDD）

### Task 1: geometry 补充函数

**Files:**
- Modify: `packages/app/src/renderer/screenshot/geometry.ts`
- Test: `packages/app/src/renderer/screenshot/geometry.test.ts`

- [ ] **Step 1: 写失败的测试**（追加到 `geometry.test.ts` 末尾）

```ts
import { distToSegment, clampPoint, pointInRect } from './geometry.js'

describe('distToSegment', () => {
  it('is the perpendicular distance inside the segment and the end distance outside it', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(distToSegment({ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0)
  })
})

describe('clampPoint / pointInRect', () => {
  const r = { x: 10, y: 10, w: 100, h: 50 }
  it('clamps into the rect', () => {
    expect(clampPoint({ x: 0, y: 200 }, r)).toEqual({ x: 10, y: 60 })
    expect(clampPoint({ x: 50, y: 30 }, r)).toEqual({ x: 50, y: 30 })
  })
  it('includes edges', () => {
    expect(pointInRect({ x: 10, y: 60 }, r)).toBe(true)
    expect(pointInRect({ x: 9, y: 30 }, r)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/renderer/screenshot/geometry.test.ts`
Expected: FAIL（`distToSegment` 等未导出）

- [ ] **Step 3: 实现**（追加到 `geometry.ts`）

```ts
/** Shortest distance from `p` to the segment a–b. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function clampPoint(p: Point, r: Rect): Point {
  return { x: Math.min(r.x + r.w, Math.max(r.x, p.x)), y: Math.min(r.y + r.h, Math.max(r.y, p.y)) }
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/renderer/screenshot/geometry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/screenshot/geometry.ts packages/app/src/renderer/screenshot/geometry.test.ts
git commit -m "feat(screenshot): geometry 增加线段距离、点钳制与包含判断"
```

### Task 2: bitmap（BGRA→RGBA、取色）

**Files:**
- Create: `packages/app/src/renderer/screenshot/bitmap.ts`
- Test: `packages/app/src/renderer/screenshot/bitmap.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest'
import { bgraToRgba, hexOf } from './bitmap.js'

describe('bgraToRgba', () => {
  it('swaps B and R and makes every pixel opaque (aligned buffer)', () => {
    const src = new Uint8Array([0, 0, 255, 255, 10, 20, 30, 0])   // red, then B=10 G=20 R=30 A=0
    expect([...bgraToRgba(src)]).toEqual([255, 0, 0, 255, 30, 20, 10, 255])
  })
  it('handles a view that is not 4-byte aligned', () => {
    const backing = new Uint8Array(9)
    backing.set([0, 0, 255, 255, 1, 2, 3, 4], 1)
    expect([...bgraToRgba(backing.subarray(1))]).toEqual([255, 0, 0, 255, 3, 2, 1, 255])
  })
})

describe('hexOf', () => {
  it('formats #RRGGBB', () => {
    expect(hexOf(255, 0, 16)).toBe('#FF0010')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/renderer/screenshot/bitmap.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
/**
 * Electron's nativeImage.toBitmap() is BGRA; canvas ImageData wants RGBA.
 * Screen captures are opaque, so alpha is forced to 255. Uses a 32-bit view
 * (one op per pixel) when the buffer is 4-byte aligned — an IPC-delivered
 * Uint8Array can start at any offset, so fall back to bytes otherwise.
 */
export function bgraToRgba(src: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length)
  if (src.byteOffset % 4 === 0 && src.length % 4 === 0) {
    const s = new Uint32Array(src.buffer, src.byteOffset, src.length / 4)
    const d = new Uint32Array(out.buffer)
    for (let i = 0; i < s.length; i++) {
      const v = s[i]
      // little-endian: BGRA bytes = 0xAARRGGBB, RGBA bytes = 0xAABBGGRR
      d[i] = (0xff000000 | (v & 0x0000ff00) | ((v >>> 16) & 0xff) | ((v & 0xff) << 16)) >>> 0
    }
    return out
  }
  for (let i = 0; i < src.length; i += 4) {
    out[i] = src[i + 2]
    out[i + 1] = src[i + 1]
    out[i + 2] = src[i]
    out[i + 3] = 255
  }
  return out
}

export function hexOf(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/renderer/screenshot/bitmap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/screenshot/bitmap.ts packages/app/src/renderer/screenshot/bitmap.test.ts
git commit -m "feat(screenshot): BGRA 位图转 RGBA 与取色格式化"
```

### Task 3: history（撤销 / 重做）

**Files:**
- Create: `packages/app/src/renderer/screenshot/history.ts`
- Test: `packages/app/src/renderer/screenshot/history.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest'
import { initHistory, commit, undo, redo, canUndo, canRedo } from './history.js'

describe('history', () => {
  it('undoes and redoes commits, and a new commit clears the redo stack', () => {
    let h = initHistory<number[]>([])
    h = commit(h, [1])
    h = commit(h, [1, 2])
    expect(h.present).toEqual([1, 2])
    h = undo(h)
    expect(h.present).toEqual([1])
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toEqual([1, 2])
    h = undo(undo(h))
    expect(h.present).toEqual([])
    expect(canUndo(h)).toBe(false)
    h = commit(h, [9])
    expect(canRedo(h)).toBe(false)
  })
  it('undo/redo at the ends and committing the same value are no-ops', () => {
    const h = initHistory([1])
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
    expect(commit(h, h.present)).toBe(h)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/renderer/screenshot/history.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
export interface History<T> { past: T[]; present: T; future: T[] }

export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h
  return { past: [...h.past, h.present], present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

export const canUndo = (h: History<unknown>) => h.past.length > 0
export const canRedo = (h: History<unknown>) => h.future.length > 0
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/renderer/screenshot/history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/screenshot/history.ts packages/app/src/renderer/screenshot/history.test.ts
git commit -m "feat(screenshot): 标注的撤销 / 重做栈"
```

### Task 4: shapes（标注模型）

**Files:**
- Create: `packages/app/src/renderer/screenshot/shapes.ts`
- Test: `packages/app/src/renderer/screenshot/shapes.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest'
import { shapeBounds, hitTest, translateShape, nextNumber, textWidth, DEFAULT_STYLE, type Shape } from './shapes.js'

const style = { ...DEFAULT_STYLE, width: 4 }
const rect: Shape = { id: 'r', kind: 'rect', style, rect: { x: 10, y: 10, w: 100, h: 50 } }
const ellipse: Shape = { id: 'e', kind: 'ellipse', style, rect: { x: 0, y: 0, w: 100, h: 50 } }
const arrow: Shape = { id: 'a', kind: 'arrow', style, tail: { x: 0, y: 0 }, head: { x: 100, y: 0 } }
const pen: Shape = { id: 'p', kind: 'pen', style, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] }
const text: Shape = { id: 't', kind: 'text', style: { ...style, fontSize: 20 }, at: { x: 10, y: 10 }, text: 'ab中' }
const num: Shape = { id: 'n', kind: 'number', style, at: { x: 100, y: 100 }, n: 3 }

describe('hitTest', () => {
  it('rect: the border, not the hollow inside', () => {
    expect(hitTest(rect, { x: 10, y: 30 })).toBe(true)
    expect(hitTest(rect, { x: 60, y: 35 })).toBe(false)
  })
  it('ellipse: near the outline', () => {
    expect(hitTest(ellipse, { x: 100, y: 25 })).toBe(true)
    expect(hitTest(ellipse, { x: 50, y: 25 })).toBe(false)
  })
  it('arrow and pen: near any segment', () => {
    expect(hitTest(arrow, { x: 50, y: 3 })).toBe(true)
    expect(hitTest(arrow, { x: 50, y: 30 })).toBe(false)
    expect(hitTest(pen, { x: 52, y: 25 })).toBe(true)
    expect(hitTest(pen, { x: 25, y: 25 })).toBe(false)
  })
  it('text: inside its box; number: inside its circle', () => {
    expect(hitTest(text, { x: 15, y: 15 })).toBe(true)
    expect(hitTest(text, { x: 200, y: 15 })).toBe(false)
    expect(hitTest(num, { x: 105, y: 100 })).toBe(true)
    expect(hitTest(num, { x: 140, y: 100 })).toBe(false)
  })
})

describe('shapeBounds / translateShape / nextNumber', () => {
  it('bounds include the stroke', () => {
    expect(shapeBounds(rect)).toEqual({ x: 8, y: 8, w: 104, h: 54 })
    expect(shapeBounds(text)).toEqual({ x: 10, y: 10, w: textWidth('ab中', 20), h: 20 * 1.25 })
  })
  it('translate moves every coordinate', () => {
    expect(translateShape(arrow, 5, -5)).toMatchObject({ tail: { x: 5, y: -5 }, head: { x: 105, y: -5 } })
    expect(translateShape(pen, 1, 1)).toMatchObject({ points: [{ x: 1, y: 1 }, { x: 51, y: 1 }, { x: 51, y: 51 }] })
  })
  it('numbers continue from the highest', () => {
    expect(nextNumber([])).toBe(1)
    expect(nextNumber([rect, num])).toBe(4)
  })
  it('CJK characters are full width, others ~0.6em', () => {
    expect(textWidth('ab中', 20)).toBe(20 * 0.6 * 2 + 20)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/renderer/screenshot/shapes.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import { arrowHead, distToSegment, type Point, type Rect } from './geometry.js'

export type ToolKind = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'highlighter' | 'text' | 'mosaic' | 'number'
export interface ShapeStyle { color: string; width: number; fontSize: number }

interface Base { id: string; style: ShapeStyle }
export type Shape =
  | (Base & { kind: 'rect' | 'ellipse'; rect: Rect })
  | (Base & { kind: 'arrow'; tail: Point; head: Point })
  | (Base & { kind: 'pen' | 'highlighter' | 'mosaic'; points: Point[] })
  | (Base & { kind: 'text'; at: Point; text: string })
  | (Base & { kind: 'number'; at: Point; n: number })

export const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#1d1d1f']
export const WIDTHS = [2, 4, 8]
export const FONT_SIZES = [14, 18, 28]
export const DEFAULT_STYLE: ShapeStyle = { color: COLORS[0], width: WIDTHS[1], fontSize: FONT_SIZES[1] }
export const MOSAIC_CELL = 10
export const HIT_TOLERANCE = 6
const HIGHLIGHTER_ALPHA = 0.35
const LINE_HEIGHT = 1.25
const FONT_FAMILY = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'

/** Stroke width actually drawn for a shape (highlighter and mosaic are broad brushes). */
export function strokeWidth(s: Shape): number {
  if (s.kind === 'highlighter') return s.style.width * 4 + 6
  if (s.kind === 'mosaic') return s.style.width * 4 + 8
  return s.style.width
}

export const numberRadius = (style: ShapeStyle) => 10 + style.width * 1.5

/** Width estimate without a canvas: CJK full width, others 0.6em. */
export function textWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) w += /[⺀-鿿가-힯＀-￯]/.test(ch) ? fontSize : fontSize * 0.6
  return w
}

export const newShapeId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function pointsBounds(points: Point[], pad: number): Rect {
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
}

export function shapeBounds(s: Shape): Rect {
  const half = strokeWidth(s) / 2
  switch (s.kind) {
    case 'rect': case 'ellipse':
      return { x: s.rect.x - half, y: s.rect.y - half, w: s.rect.w + half * 2, h: s.rect.h + half * 2 }
    case 'arrow': return pointsBounds([s.tail, s.head], half + 8)
    case 'pen': case 'highlighter': case 'mosaic': return pointsBounds(s.points, half)
    case 'text': return { x: s.at.x, y: s.at.y, w: textWidth(s.text, s.style.fontSize), h: s.style.fontSize * LINE_HEIGHT }
    case 'number': {
      const r = numberRadius(s.style)
      return { x: s.at.x - r, y: s.at.y - r, w: r * 2, h: r * 2 }
    }
  }
}

export function hitTest(s: Shape, p: Point, tol = HIT_TOLERANCE): boolean {
  const reach = tol + strokeWidth(s) / 2
  switch (s.kind) {
    case 'rect': {
      const { x, y, w, h } = s.rect
      const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
      return c.some((a, i) => distToSegment(p, a, c[(i + 1) % 4]) <= reach)
    }
    case 'ellipse': {
      const rx = s.rect.w / 2, ry = s.rect.h / 2
      if (rx <= 0 || ry <= 0) return false
      const d = Math.hypot((p.x - (s.rect.x + rx)) / rx, (p.y - (s.rect.y + ry)) / ry)
      return Math.abs(d - 1) * Math.min(rx, ry) <= reach
    }
    case 'arrow': return distToSegment(p, s.tail, s.head) <= reach
    case 'pen': case 'highlighter': case 'mosaic':
      if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= reach
      return s.points.some((a, i) => i > 0 && distToSegment(p, s.points[i - 1], a) <= reach)
    case 'text': {
      const b = shapeBounds(s)
      return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
    }
    case 'number': return Math.hypot(p.x - s.at.x, p.y - s.at.y) <= numberRadius(s.style)
  }
}

export function translateShape(s: Shape, dx: number, dy: number): Shape {
  const mv = (p: Point) => ({ x: p.x + dx, y: p.y + dy })
  switch (s.kind) {
    case 'rect': case 'ellipse': return { ...s, rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy } }
    case 'arrow': return { ...s, tail: mv(s.tail), head: mv(s.head) }
    case 'pen': case 'highlighter': case 'mosaic': return { ...s, points: s.points.map(mv) }
    case 'text': case 'number': return { ...s, at: mv(s.at) }
  }
}

export function nextNumber(shapes: Shape[]): number {
  return shapes.reduce((m, s) => (s.kind === 'number' ? Math.max(m, s.n) : m), 0) + 1
}

/** Topmost shape under `p` (last drawn wins). */
export function shapeAt(shapes: Shape[], p: Point): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i], p)) return shapes[i]
  return null
}

export interface RenderOptions {
  /** Target pixels per CSS px (1 on-screen at dpr 1; devicePixelRatio; the capture scale when composing). */
  scale: number
  /** The captured screen (device px), for mosaic sampling. */
  background?: CanvasImageSource & { width: number; height: number }
  /** Device px per CSS px of `background`. */
  backgroundScale?: number
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[], k: number, ox = 0, oy = 0): void {
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo((p.x - ox) * k, (p.y - oy) * k) : ctx.lineTo((p.x - ox) * k, (p.y - oy) * k)))
  if (points.length === 1) ctx.lineTo((points[0].x - ox) * k + 0.01, (points[0].y - oy) * k)
  ctx.stroke()
}

function drawMosaic(ctx: CanvasRenderingContext2D, s: Shape & { kind: 'mosaic' }, k: number, o: RenderOptions): void {
  if (!o.background) return
  const bs = o.backgroundScale ?? 1
  const b = shapeBounds(s)
  const cols = Math.max(1, Math.ceil(b.w / MOSAIC_CELL)), rows = Math.max(1, Math.ceil(b.h / MOSAIC_CELL))
  const small = document.createElement('canvas')
  small.width = cols; small.height = rows
  small.getContext('2d')!.drawImage(o.background, b.x * bs, b.y * bs, cols * MOSAIC_CELL * bs, rows * MOSAIC_CELL * bs, 0, 0, cols, rows)
  const tmp = document.createElement('canvas')
  tmp.width = Math.max(1, Math.ceil(cols * MOSAIC_CELL * k)); tmp.height = Math.max(1, Math.ceil(rows * MOSAIC_CELL * k))
  const t = tmp.getContext('2d')!
  t.imageSmoothingEnabled = false
  t.drawImage(small, 0, 0, tmp.width, tmp.height)
  // Keep the pixelated image only under the brush stroke.
  t.globalCompositeOperation = 'destination-in'
  t.lineWidth = strokeWidth(s) * k; t.lineCap = 'round'; t.lineJoin = 'round'; t.strokeStyle = '#000'
  strokePath(t, s.points, k, b.x, b.y)
  ctx.drawImage(tmp, b.x * k, b.y * k)
}

export function renderShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], o: RenderOptions): void {
  const k = o.scale
  for (const s of shapes) {
    ctx.save()
    ctx.strokeStyle = s.style.color
    ctx.fillStyle = s.style.color
    ctx.lineWidth = strokeWidth(s) * k
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    switch (s.kind) {
      case 'rect':
        ctx.strokeRect(s.rect.x * k, s.rect.y * k, s.rect.w * k, s.rect.h * k)
        break
      case 'ellipse':
        ctx.beginPath()
        ctx.ellipse((s.rect.x + s.rect.w / 2) * k, (s.rect.y + s.rect.h / 2) * k, (s.rect.w / 2) * k, (s.rect.h / 2) * k, 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'arrow': {
        const tail = { x: s.tail.x * k, y: s.tail.y * k }, head = { x: s.head.x * k, y: s.head.y * k }
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke()
        const [a, b] = arrowHead(tail, head, (12 + s.style.width * 2) * k)
        ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.closePath(); ctx.fill()
        break
      }
      case 'pen':
        strokePath(ctx, s.points, k)
        break
      case 'highlighter':
        ctx.globalAlpha = HIGHLIGHTER_ALPHA
        ctx.lineCap = 'butt'
        strokePath(ctx, s.points, k)
        break
      case 'mosaic':
        drawMosaic(ctx, s, k, o)
        break
      case 'text':
        ctx.font = `${s.style.fontSize * k}px ${FONT_FAMILY}`
        ctx.textBaseline = 'top'
        ctx.fillText(s.text, s.at.x * k, s.at.y * k)
        break
      case 'number': {
        const r = numberRadius(s.style) * k
        ctx.beginPath(); ctx.arc(s.at.x * k, s.at.y * k, r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.round(r * 1.1)}px ${FONT_FAMILY}`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(s.n), s.at.x * k, s.at.y * k + r * 0.05)
        break
      }
    }
    ctx.restore()
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/renderer/screenshot/shapes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/screenshot/shapes.ts packages/app/src/renderer/screenshot/shapes.test.ts
git commit -m "feat(screenshot): 标注模型——8 种标注的包围盒、命中、平移、序号与绘制"
```

### Task 5: selection（选区状态机）

**Files:**
- Create: `packages/app/src/renderer/screenshot/selection.ts`
- Test: `packages/app/src/renderer/screenshot/selection.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest'
import { idleState, pointerDown, pointerMove, pointerUp, nudge, escape, rightClick, currentRect, handleAt, type Env, type SelState } from './selection.js'

const bounds = { x: 0, y: 0, w: 1000, h: 800 }
const win = { x: 100, y: 100, w: 300, h: 200 }
const env: Env = { bounds, windows: [win, bounds], locked: false }
const drag = (s: SelState, a: { x: number; y: number }, b: { x: number; y: number }, e = env) =>
  pointerUp(pointerMove(pointerDown(s, a, e), b, e), b, e)

describe('selection state machine', () => {
  it('hovering highlights the window under the cursor', () => {
    const s = pointerMove(idleState(), { x: 150, y: 150 }, env)
    expect(s).toEqual({ mode: 'idle', hover: win })
  })
  it('a click without dragging selects the hovered window', () => {
    const s = pointerUp(pointerDown(idleState(), { x: 150, y: 150 }, env), { x: 151, y: 151 }, env)
    expect(s).toEqual({ mode: 'selected', rect: win })
  })
  it('a drag selects the dragged rectangle, clamped to the display', () => {
    expect(currentRect(drag(idleState(), { x: 900, y: 700 }, { x: 1200, y: 600 }))).toEqual({ x: 900, y: 600, w: 100, h: 100 })
  })
  it('resizes by a corner handle and flips past the opposite edge', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 100, y: 100, w: 100, h: 100 } }
    expect(handleAt({ x: 200, y: 200 }, { x: 100, y: 100, w: 100, h: 100 })).toBe('se')
    expect(currentRect(drag(sel, { x: 200, y: 200 }, { x: 250, y: 260 }))).toEqual({ x: 100, y: 100, w: 150, h: 160 })
    expect(currentRect(drag(sel, { x: 200, y: 200 }, { x: 50, y: 50 }))).toEqual({ x: 50, y: 50, w: 50, h: 50 })
  })
  it('moves by dragging inside, never past the display edge', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 100, y: 100, w: 100, h: 100 } }
    expect(currentRect(drag(sel, { x: 150, y: 150 }, { x: 1150, y: 160 }))).toEqual({ x: 900, y: 110, w: 100, h: 100 })
  })
  it('once annotated (locked), the region cannot be moved, resized or replaced', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 100, y: 100, w: 100, h: 100 } }
    const locked = { ...env, locked: true }
    expect(drag(sel, { x: 150, y: 150 }, { x: 300, y: 300 }, locked)).toEqual(sel)
    expect(drag(sel, { x: 600, y: 600 }, { x: 700, y: 700 }, locked)).toEqual(sel)
  })
  it('arrow keys nudge the selection inside the display', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 0, y: 10, w: 100, h: 100 } }
    expect(currentRect(nudge(sel, -10, 5, env))).toEqual({ x: 0, y: 15, w: 100, h: 100 })
  })
  it('Esc and right-click drop the selection first, then exit (null)', () => {
    const sel: SelState = { mode: 'selected', rect: { x: 0, y: 0, w: 10, h: 10 } }
    expect(escape(sel, false)).toEqual(idleState())
    expect(escape(sel, true)).toBeNull()
    expect(escape(idleState(), false)).toBeNull()
    expect(rightClick(sel)).toEqual(idleState())
    expect(rightClick(idleState())).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/renderer/screenshot/selection.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import { normalizeRect, isUsableSelection, pointInRect, type Point, type Rect } from './geometry.js'

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const DRAG_THRESHOLD = 4
const HANDLE_HIT = 7

export type SelState =
  | { mode: 'idle'; hover: Rect | null }
  | { mode: 'dragging'; origin: Point; rect: Rect; candidate: Rect | null }
  | { mode: 'selected'; rect: Rect }
  | { mode: 'resizing'; rect: Rect; handle: Handle; start: Point; startRect: Rect }
  | { mode: 'moving'; rect: Rect; start: Point; startRect: Rect }

/** bounds: the display (overlay) rect; windows: click-to-select targets, frontmost first; locked: annotations exist. */
export interface Env { bounds: Rect; windows: Rect[]; locked: boolean }

export const idleState = (): SelState => ({ mode: 'idle', hover: null })

export function currentRect(s: SelState): Rect | null {
  return s.mode === 'idle' ? null : s.rect
}

export function windowAt(p: Point, windows: Rect[]): Rect | null {
  return windows.find(w => pointInRect(p, w)) ?? null
}

export function handlePoint(r: Rect, h: Handle): Point {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2
  return { x, y }
}

export function handleAt(p: Point, r: Rect): Handle | null {
  return HANDLES.find(h => { const q = handlePoint(r, h); return Math.abs(p.x - q.x) <= HANDLE_HIT && Math.abs(p.y - q.y) <= HANDLE_HIT }) ?? null
}

function clampRect(r: Rect, b: Rect): Rect {
  const x = Math.max(b.x, r.x), y = Math.max(b.y, r.y)
  return { x, y, w: Math.max(0, Math.min(b.x + b.w, r.x + r.w) - x), h: Math.max(0, Math.min(b.y + b.h, r.y + r.h) - y) }
}

function resizeRect(r: Rect, h: Handle, dx: number, dy: number): Rect {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
  if (h.includes('w')) x0 += dx
  if (h.includes('e')) x1 += dx
  if (h.includes('n')) y0 += dy
  if (h.includes('s')) y1 += dy
  return normalizeRect({ x: x0, y: y0 }, { x: x1, y: y1 })
}

function moveInside(r: Rect, dx: number, dy: number, b: Rect): Rect {
  return {
    ...r,
    x: Math.min(b.x + b.w - r.w, Math.max(b.x, r.x + dx)),
    y: Math.min(b.y + b.h - r.h, Math.max(b.y, r.y + dy)),
  }
}

export function pointerDown(s: SelState, p: Point, env: Env): SelState {
  if (s.mode === 'selected') {
    if (env.locked) return s
    const h = handleAt(p, s.rect)
    if (h) return { mode: 'resizing', rect: s.rect, handle: h, start: p, startRect: s.rect }
    if (pointInRect(p, s.rect)) return { mode: 'moving', rect: s.rect, start: p, startRect: s.rect }
  }
  if (s.mode === 'idle' || s.mode === 'selected') {
    return { mode: 'dragging', origin: p, rect: { x: p.x, y: p.y, w: 0, h: 0 }, candidate: windowAt(p, env.windows) }
  }
  return s
}

export function pointerMove(s: SelState, p: Point, env: Env): SelState {
  switch (s.mode) {
    case 'idle': {
      const hover = windowAt(p, env.windows)
      return hover === s.hover ? s : { mode: 'idle', hover }
    }
    case 'dragging': return { ...s, rect: clampRect(normalizeRect(s.origin, p), env.bounds) }
    case 'resizing': return { ...s, rect: clampRect(resizeRect(s.startRect, s.handle, p.x - s.start.x, p.y - s.start.y), env.bounds) }
    case 'moving': return { ...s, rect: moveInside(s.startRect, p.x - s.start.x, p.y - s.start.y, env.bounds) }
    default: return s
  }
}

export function pointerUp(s: SelState, p: Point, env: Env): SelState {
  switch (s.mode) {
    case 'dragging': {
      const moved = Math.hypot(p.x - s.origin.x, p.y - s.origin.y) >= DRAG_THRESHOLD
      if (!moved && s.candidate) return { mode: 'selected', rect: clampRect(s.candidate, env.bounds) }
      if (isUsableSelection(s.rect)) return { mode: 'selected', rect: s.rect }
      return { mode: 'idle', hover: windowAt(p, env.windows) }
    }
    case 'resizing': case 'moving':
      return isUsableSelection(s.rect) ? { mode: 'selected', rect: s.rect } : { mode: 'selected', rect: s.startRect }
    default: return s
  }
}

export function nudge(s: SelState, dx: number, dy: number, env: Env): SelState {
  if (s.mode !== 'selected' || env.locked) return s
  return { mode: 'selected', rect: moveInside(s.rect, dx, dy, env.bounds) }
}

/** Esc: drop an un-annotated selection; otherwise null = leave the screenshot. */
export function escape(s: SelState, locked: boolean): SelState | null {
  return s.mode === 'selected' && !locked ? idleState() : null
}

/** Right click: drop the selection; with nothing selected, null = leave. */
export function rightClick(s: SelState): SelState | null {
  return s.mode === 'idle' ? null : idleState()
}

export function cursorFor(s: SelState, p: Point | null, env: Env): string {
  if (s.mode === 'moving') return 'move'
  if (s.mode === 'dragging') return 'crosshair'
  if (s.mode === 'resizing') return `${s.handle}-resize`
  if (s.mode === 'selected' && p && !env.locked) {
    const h = handleAt(p, s.rect)
    if (h) return `${h}-resize`
    if (pointInRect(p, s.rect)) return 'move'
  }
  return 'crosshair'
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/renderer/screenshot/selection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/screenshot/selection.ts packages/app/src/renderer/screenshot/selection.test.ts
git commit -m "feat(screenshot): 选区状态机——窗口点选、拖拽、8 向调整、移动、微调、逐级退出"
```

### Task 6: compose 与样式记忆

**Files:**
- Create: `packages/app/src/renderer/screenshot/compose.ts`
- Create: `packages/app/src/renderer/screenshot/prefs.ts`
- Test: `packages/app/src/renderer/screenshot/compose.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest'
import { deviceCrop } from './compose.js'

describe('deviceCrop', () => {
  it('scales to device px, rounds, and stays inside the bitmap', () => {
    expect(deviceCrop({ x: 10.2, y: 20.6, w: 100, h: 50 }, 2, { w: 2000, h: 1000 })).toEqual({ x: 20, y: 41, w: 200, h: 100 })
    expect(deviceCrop({ x: 990, y: 490, w: 100, h: 100 }, 2, { w: 2000, h: 1000 })).toEqual({ x: 1980, y: 980, w: 20, h: 20 })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/renderer/screenshot/compose.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `compose.ts`**

```ts
import { renderShapes, type Shape } from './shapes.js'
import type { Rect } from './geometry.js'

/** Selection (CSS px) → integer device-px crop inside the captured bitmap. */
export function deviceCrop(r: Rect, scale: number, bitmap: { w: number; h: number }): Rect {
  const x = Math.min(bitmap.w - 1, Math.max(0, Math.round(r.x * scale)))
  const y = Math.min(bitmap.h - 1, Math.max(0, Math.round(r.y * scale)))
  const w = Math.max(1, Math.min(bitmap.w - x, Math.round(r.w * scale)))
  const h = Math.max(1, Math.min(bitmap.h - y, Math.round(r.h * scale)))
  return { x, y, w, h }
}

/** The final image: the selection cut from the capture at full resolution, with annotations drawn on it. */
export function composeRegion(bg: HTMLCanvasElement, r: Rect, shapes: Shape[], scale: number): HTMLCanvasElement {
  const crop = deviceCrop(r, scale, { w: bg.width, h: bg.height })
  const out = document.createElement('canvas')
  out.width = crop.w
  out.height = crop.h
  const ctx = out.getContext('2d')!
  ctx.drawImage(bg, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
  ctx.save()
  ctx.translate(-crop.x, -crop.y)
  renderShapes(ctx, shapes, { scale, background: bg, backgroundScale: scale })
  ctx.restore()
  return out
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(b => (b ? b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
```

- [ ] **Step 4: 实现 `prefs.ts`**

```ts
import { COLORS, WIDTHS, FONT_SIZES, DEFAULT_STYLE, type ShapeStyle } from './shapes.js'

const KEY = 'banjuan-screenshot-style'

/** Last used colour / width / font size; anything unrecognised falls back to the default. */
export function loadStyle(): ShapeStyle {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && COLORS.includes(v.color) && WIDTHS.includes(v.width) && FONT_SIZES.includes(v.fontSize)) return v
  } catch { /* storage unavailable or corrupt */ }
  return DEFAULT_STYLE
}

export function saveStyle(s: ShapeStyle): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}
```

- [ ] **Step 5: 运行确认通过并提交**

Run: `npx vitest run src/renderer/screenshot/compose.test.ts`
Expected: PASS

```bash
git add packages/app/src/renderer/screenshot/compose.ts packages/app/src/renderer/screenshot/compose.test.ts packages/app/src/renderer/screenshot/prefs.ts
git commit -m "feat(screenshot): 设备像素裁切合成与样式记忆"
```

### Task 7: 主进程纯函数

**Files:**
- Create: `packages/app/src/main/screenshot/pure.ts`
- Test: `packages/app/src/main/screenshot/pure.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest'
import { windowsForDisplay, screenshotFileName, zoomBounds } from './pure.js'

describe('windowsForDisplay', () => {
  const display = { x: 1000, y: 0, w: 800, h: 600 }
  it('keeps order, makes rects display-relative and clips them', () => {
    const raw = [
      { x: 1100, y: 50, w: 300, h: 200, owner: 'A' },
      { x: 900, y: 100, w: 400, h: 300, owner: 'B' },      // straddles the left edge
      { x: 0, y: 0, w: 500, h: 500, owner: 'C' },          // other display
      { x: 1500, y: 500, w: 20, h: 20, owner: 'D' },       // too small
    ]
    expect(windowsForDisplay(raw, display)).toEqual([
      { x: 100, y: 50, w: 300, h: 200 },
      { x: 0, y: 100, w: 300, h: 300 },
    ])
  })
})

describe('screenshotFileName', () => {
  it('uses the localized prefix and a sortable timestamp', () => {
    expect(screenshotFileName('截图', new Date(2026, 9, 2, 8, 5, 3))).toBe('截图 2026-10-02 080503.png')
  })
})

describe('zoomBounds', () => {
  it('zooms around the centre and limits the scale to 10%–400%', () => {
    expect(zoomBounds({ x: 100, y: 100, w: 200, h: 100 }, { w: 200, h: 100 }, 1.5)).toEqual({ x: 50, y: 75, w: 300, h: 150 })
    expect(zoomBounds({ x: 0, y: 0, w: 800, h: 400 }, { w: 200, h: 100 }, 10).w).toBe(800)
    expect(zoomBounds({ x: 0, y: 0, w: 20, h: 10 }, { w: 200, h: 100 }, 0.1).w).toBe(20)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/main/screenshot/pure.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface RawWindow { x: number; y: number; w: number; h: number; owner: string }

/** Smallest window offered as a click-to-select target (CSS px, after clipping). */
export const MIN_WINDOW = 40

/**
 * Global window rects (points, frontmost first) → rects relative to one
 * display's overlay, clipped to it. Off-display and tiny ones are dropped;
 * order is kept so the first match under the cursor is the frontmost window.
 */
export function windowsForDisplay(raw: RawWindow[], display: Rect): Rect[] {
  const out: Rect[] = []
  for (const w of raw) {
    const x0 = Math.max(w.x, display.x), y0 = Math.max(w.y, display.y)
    const x1 = Math.min(w.x + w.w, display.x + display.w), y1 = Math.min(w.y + w.h, display.y + display.h)
    if (x1 - x0 < MIN_WINDOW || y1 - y0 < MIN_WINDOW) continue
    out.push({ x: x0 - display.x, y: y0 - display.y, w: x1 - x0, h: y1 - y0 })
  }
  return out
}

/** "截图 2026-10-22 153012.png" — `prefix` is the UI-language word for "screenshot". */
export function screenshotFileName(prefix: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`
}

/** Pin-window bounds after zooming by `factor` around the centre; scale kept within 10%–400% of `natural`. */
export function zoomBounds(b: Rect, natural: { w: number; h: number }, factor: number): Rect {
  const next = Math.min(4, Math.max(0.1, (b.w / natural.w) * factor))
  const w = Math.round(natural.w * next), h = Math.round(natural.h * next)
  return { x: Math.round(b.x + (b.w - w) / 2), y: Math.round(b.y + (b.h - h) / 2), w, h }
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: `npx vitest run src/main/screenshot/pure.test.ts`
Expected: PASS

```bash
git add packages/app/src/main/screenshot/pure.ts packages/app/src/main/screenshot/pure.test.ts
git commit -m "feat(screenshot): 主进程纯函数——窗口矩形换算、文件名、钉图缩放"
```

---

## 阶段 B：主进程

### Task 8: capture.ts

**Files:**
- Create: `packages/app/src/main/screenshot/capture.ts`

- [ ] **Step 1: 实现**

```ts
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
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p .`
Expected: 无与 `capture.ts` 相关的错误

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main/screenshot/capture.ts
git commit -m "feat(screenshot): 截屏改为原始位图，并行获取窗口列表，启动预热"
```

### Task 9: hotkey.ts

**Files:**
- Create: `packages/app/src/main/screenshot/hotkey.ts`

- [ ] **Step 1: 实现**（逻辑原样迁自 `screenshot-service.ts`）

```ts
import { globalShortcut, ipcMain } from 'electron'
import { getScreenshotHotkey, setScreenshotHotkey, DEFAULT_SCREENSHOT_HOTKEY } from '../settings-store.js'

let registeredHotkey: string | null = null
let onTrigger: () => void = () => {}

function tryRegister(accel: string): boolean {
  try { return globalShortcut.register(accel, () => onTrigger()) } catch { return false /* invalid accelerator */ }
}

/**
 * Swap the global hotkey to `accel`. If it can't be registered (invalid, or
 * reserved by the system / another app), the previous hotkey stays active.
 * macOS hotkeys are non-exclusive: a clash with an app that registered the
 * same keys (e.g. Feishu ⌘⇧A) still "succeeds" here — both apps fire.
 */
function applyHotkey(accel: string): boolean {
  if (accel === registeredHotkey) return true
  const prev = registeredHotkey
  if (prev) globalShortcut.unregister(prev)
  if (tryRegister(accel)) { registeredHotkey = accel; return true }
  registeredHotkey = prev && tryRegister(prev) ? prev : null
  return false
}

function hotkeyState(): { hotkey: string; registered: boolean } {
  const hotkey = getScreenshotHotkey()
  return { hotkey, registered: registeredHotkey === hotkey }
}

export function initHotkey(trigger: () => void): void {
  onTrigger = trigger
  applyHotkey(getScreenshotHotkey())
  ipcMain.handle('settings:getScreenshotHotkey', () => hotkeyState())
  // An empty accelerator resets to the default.
  ipcMain.handle('settings:setScreenshotHotkey', (_e, accel: string) => {
    const ok = applyHotkey(accel || DEFAULT_SCREENSHOT_HOTKEY)
    if (ok) setScreenshotHotkey(accel)
    return { ok, ...hotkeyState() }
  })
}

export function disposeHotkey(): void {
  globalShortcut.unregisterAll()
  registeredHotkey = null
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/main/screenshot/hotkey.ts
git commit -m "refactor(screenshot): 快捷键注册迁入 screenshot/hotkey.ts"
```

### Task 10: overlay-window.ts

**Files:**
- Create: `packages/app/src/main/screenshot/overlay-window.ts`

- [ ] **Step 1: 实现**

```ts
import { BrowserWindow, dialog, type Display, type WebContents } from 'electron'
import { join } from 'node:path'
import type { Rect } from './pure.js'

export interface SessionPayload {
  sessionId: number
  bitmap: Buffer
  pixelWidth: number
  pixelHeight: number
  cssWidth: number
  cssHeight: number
  scaleFactor: number
  workArea: Rect
  windows: Rect[]
  canInsertNote: boolean
}

const SHOW_FALLBACK_MS = 3000

let win: BrowserWindow | null = null
/** Resolves when the page reports its listeners are registered (did-finish-load is too early: React mounts later). */
let pageReady: Promise<void> | null = null
let resolvePageReady: (() => void) | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let shownSession = 0
let onGone: () => void = () => {}

/** Called when the overlay renderer crashes or hangs (the session must end). */
export function setOverlayGoneHandler(fn: () => void): void { onGone = fn }

function clearShowTimer(): void {
  if (showTimer) clearTimeout(showTimer)
  showTimer = null
}

function load(w: BrowserWindow): Promise<void> {
  if (process.env.VITE_DEV_SERVER_URL) return w.loadURL(`${process.env.VITE_DEV_SERVER_URL}screenshot.html`)
  return w.loadFile(join(__dirname, '../renderer/screenshot.html'))
}

/**
 * The overlay is created once (pre-warmed) and reused: hidden between
 * screenshots, never destroyed unless its renderer dies. backgroundThrottling
 * must be off — otherwise a hidden window gets no animation frames, the page
 * can't report `ready`, and every screenshot waits for the 3s fallback.
 */
function getOverlay(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  const w = new BrowserWindow({
    show: false,
    // Opaque, not transparent: it's covered by the capture anyway, and
    // transparent always-on-top windows + heavy canvas work crash macOS's GPU.
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false, enableLargerThanScreen: true, fullscreenable: false,
    alwaysOnTop: true, backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  })
  // 'floating' stays above normal windows without covering the menu bar or
  // blocking Mission Control / Cmd-Tab — a glitch can never trap the user.
  w.setAlwaysOnTop(true, 'floating')
  w.webContents.on('render-process-gone', (_e, d) => {
    destroyOverlay()
    onGone()
    dialog.showErrorBox('Screenshot overlay crashed', `reason: ${d.reason}, exitCode: ${d.exitCode}`)
  })
  w.on('unresponsive', () => { destroyOverlay(); onGone() })
  w.on('closed', () => { if (win === w) { win = null; pageReady = null } })
  pageReady = new Promise(res => { resolvePageReady = res })
  load(w).catch(err => { console.error('[screenshot] overlay page failed to load', err) })
  win = w
  return w
}

/** The overlay page has registered its session listeners. */
export function markPageReady(sender: WebContents): void {
  if (isOverlaySender(sender)) { resolvePageReady?.(); resolvePageReady = null }
}

export function prewarmOverlay(): void { getOverlay() }

export function destroyOverlay(): void {
  clearShowTimer()
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  pageReady = null
}

/** Place the overlay on `display` and hand it the session; it shows once the page reports `ready`. */
export async function presentSession(display: Display, payload: SessionPayload): Promise<void> {
  const w = getOverlay()
  // Normally long resolved (pre-warmed); bounded so a broken page can't stall the screenshot forever.
  await Promise.race([pageReady, new Promise(res => setTimeout(res, SHOW_FALLBACK_MS))])
  if (w.isDestroyed()) return
  w.setBounds(display.bounds)
  w.webContents.send('screenshot:session', payload)
  clearShowTimer()
  // If `ready` never comes (renderer error), show anyway: the page's error panel and Esc must be reachable.
  showTimer = setTimeout(() => revealOverlay(payload.sessionId), SHOW_FALLBACK_MS)
  shownSession = payload.sessionId
}

/** Show the overlay for `sessionId` (ignored for a stale session). */
export function revealOverlay(sessionId: number): boolean {
  if (!win || win.isDestroyed() || sessionId !== shownSession) return false
  clearShowTimer()
  if (!win.isVisible()) {
    win.show()
    win.focus()
  }
  return true
}

/** End of a screenshot: hide and tell the page to drop its state (the window is kept for the next one). */
export function hideOverlay(): void {
  clearShowTimer()
  shownSession = 0
  if (!win || win.isDestroyed()) return
  win.hide()
  win.webContents.send('screenshot:reset')
}

export function isOverlaySender(sender: WebContents): boolean {
  return !!win && !win.isDestroyed() && win.webContents === sender
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/main/screenshot/overlay-window.ts
git commit -m "feat(screenshot): 预热复用的浮层窗口——画好再显示、隐藏即重置、崩溃重建"
```

### Task 11: outputs.ts（复制、保存、钉图）

**Files:**
- Create: `packages/app/src/main/screenshot/outputs.ts`

- [ ] **Step 1: 实现**

```ts
import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { screenshotFileName, zoomBounds, type Rect } from './pure.js'

export function copyPng(png: Buffer): void {
  clipboard.writeImage(nativeImage.createFromBuffer(png))
}

/** Save dialog (default: Pictures/"截图 YYYY-MM-DD HHmmss.png"); null when cancelled. */
export async function savePng(png: Buffer, fileNamePrefix: string): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: join(app.getPath('pictures'), screenshotFileName(fileNamePrefix)),
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (canceled || !filePath) return null
  await writeFile(filePath, png)
  return filePath
}

interface PinInfo { png: Buffer; natural: { w: number; h: number } }
const pins = new Map<BrowserWindow, PinInfo>()

/** A small always-on-top window showing the screenshot where it was taken (global CSS px rect). */
export function openPin(png: Buffer, at: Rect): void {
  const natural = { w: Math.max(1, Math.round(at.w)), h: Math.max(1, Math.round(at.h)) }
  const pin = new BrowserWindow({
    x: Math.round(at.x), y: Math.round(at.y), width: natural.w, height: natural.h,
    frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: true, alwaysOnTop: true, show: false, enableLargerThanScreen: true,
    backgroundColor: '#ffffff',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
  })
  pin.setAlwaysOnTop(true, 'floating')
  pins.set(pin, { png, natural })
  pin.on('closed', () => pins.delete(pin))
  if (process.env.VITE_DEV_SERVER_URL) void pin.loadURL(`${process.env.VITE_DEV_SERVER_URL}screenshot.html#pin`)
  else void pin.loadFile(join(__dirname, '../renderer/screenshot.html'), { hash: 'pin' })
}

function pinOf(sender: Electron.WebContents): [BrowserWindow, PinInfo] | null {
  const w = BrowserWindow.fromWebContents(sender)
  const info = w ? pins.get(w) : undefined
  return w && info ? [w, info] : null
}

export function initPinIpc(): void {
  // The page asks once its listener is registered (sending on did-finish-load can arrive before React mounts).
  ipcMain.on('screenshot:pin-request', (e) => { const p = pinOf(e.sender); if (p) e.sender.send('screenshot:pin-init', { png: p[1].png }) })
  ipcMain.on('screenshot:pin-ready', (e) => { pinOf(e.sender)?.[0].show() })
  ipcMain.on('screenshot:pin-move', (e, dx: number, dy: number) => {
    const p = pinOf(e.sender)
    if (!p) return
    const [x, y] = p[0].getPosition()
    p[0].setPosition(Math.round(x + dx), Math.round(y + dy))
  })
  ipcMain.on('screenshot:pin-zoom', (e, factor: number) => {
    const p = pinOf(e.sender)
    if (!p) return
    const b = p[0].getBounds()
    const n = zoomBounds({ x: b.x, y: b.y, w: b.width, h: b.height }, p[1].natural, factor)
    p[0].setBounds({ x: n.x, y: n.y, width: n.w, height: n.h })
  })
  ipcMain.on('screenshot:pin-close', (e) => { pinOf(e.sender)?.[0].close() })
  // Labels come from the page: main has no i18n.
  ipcMain.on('screenshot:pin-menu', (e, labels: { copy: string; save: string; close: string; fileNamePrefix: string }) => {
    const p = pinOf(e.sender)
    if (!p) return
    const [w, info] = p
    Menu.buildFromTemplate([
      { label: labels.copy, click: () => copyPng(info.png) },
      { label: labels.save, click: () => { void savePng(info.png, labels.fileNamePrefix) } },
      { type: 'separator' },
      { label: labels.close, click: () => w.close() },
    ]).popup({ window: w })
  })
}

export function closeAllPins(): void {
  for (const w of pins.keys()) if (!w.isDestroyed()) w.destroy()
  pins.clear()
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/main/screenshot/outputs.ts
git commit -m "feat(screenshot): 输出动作——复制、保存到文件、钉图窗口"
```

### Task 12: 会话调度（screenshot/index.ts）、windows.ts、入口切换

**Files:**
- Create: `packages/app/src/main/screenshot/index.ts`
- Modify: `packages/app/src/main/windows.ts`
- Modify: `packages/app/src/main/index.ts:7`
- Delete: `packages/app/src/main/screenshot-service.ts`

- [ ] **Step 1: `windows.ts` 记录最近聚焦的书房窗口；非 macOS 最后一个书房窗口关闭时退出**

在 `import` 行加入 `app`：

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
```

在 `let quitFlushed = false` 之后加：

```ts
let lastFocused: BrowserWindow | null = null

/** The library window the user used last — target for "insert into note" and screenshot notices. */
export function getLastFocusedLibraryWindow(): BrowserWindow | null {
  if (lastFocused && !lastFocused.isDestroyed()) return lastFocused
  return [...windows].find(w => !w.isDestroyed()) ?? null
}
```

把 `win.on('closed', () => windows.delete(win))` 换成：

```ts
  win.on('focus', () => { lastFocused = win })
  win.on('closed', () => {
    windows.delete(win)
    if (lastFocused === win) lastFocused = null
    // The pre-warmed screenshot overlay is a hidden window that never closes,
    // so 'window-all-closed' no longer fires on Windows/Linux: quit here.
    if (process.platform !== 'darwin' && windows.size === 0) app.quit()
  })
```

- [ ] **Step 2: 实现 `screenshot/index.ts`**

```ts
import { dialog, ipcMain, screen, type Display } from 'electron'
import { captureDisplay, listWindows, hasScreenPermission, promptScreenPermission, warmUpCapturer, type Capture } from './capture.js'
import { windowsForDisplay, type RawWindow, type Rect } from './pure.js'
import { prewarmOverlay, presentSession, revealOverlay, hideOverlay, destroyOverlay, setOverlayGoneHandler, isOverlaySender, markPageReady, type SessionPayload } from './overlay-window.js'
import { copyPng, savePng, openPin, initPinIpc, closeAllPins } from './outputs.js'
import { initHotkey, disposeHotkey } from './hotkey.js'
import { getLastFocusedLibraryWindow } from '../windows.js'

type Action = 'copy' | 'save' | 'pin' | 'insert'

interface Session {
  id: number
  display: Display
  started: number
  raw: RawWindow[]
  /** True until the user starts selecting — only then may the overlay follow the cursor to another display. */
  idle: boolean
  switching: boolean
  followTimer: ReturnType<typeof setInterval> | null
  /** Captures by display id (the current one, then the others in the background). */
  cache: Map<number, Capture>
}

const FOLLOW_INTERVAL_MS = 50
const PREWARM_DELAY_MS = 3000

let session: Session | null = null
let nextSessionId = 1
/** webContents id → whether its active tab is a text note (can receive "insert into note"). */
const insertTargets = new Map<number, boolean>()

function displayRect(d: Display): Rect {
  return { x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height }
}

function payloadFor(s: Session, display: Display, cap: Capture): SessionPayload {
  const wa = display.workArea
  const target = getLastFocusedLibraryWindow()
  return {
    sessionId: s.id,
    bitmap: cap.bitmap,
    pixelWidth: cap.pixelWidth,
    pixelHeight: cap.pixelHeight,
    cssWidth: display.bounds.width,
    cssHeight: display.bounds.height,
    scaleFactor: cap.pixelWidth / display.bounds.width,
    workArea: { x: wa.x - display.bounds.x, y: wa.y - display.bounds.y, w: wa.width, h: wa.height },
    windows: windowsForDisplay(s.raw, displayRect(display)),
    canInsertNote: !!target && insertTargets.get(target.webContents.id) === true,
  }
}

function endSession(): void {
  if (session?.followTimer) clearInterval(session.followTimer)
  session = null
  hideOverlay()
}

export async function triggerCapture(): Promise<void> {
  if (session) return
  if (!hasScreenPermission()) { promptScreenPermission(); return }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const s: Session = { id: nextSessionId++, display, started: Date.now(), raw: [], idle: true, switching: false, followTimer: null, cache: new Map() }
  session = s
  try {
    const [cap, raw] = await Promise.all([captureDisplay(display), listWindows()])
    if (session !== s) return
    s.raw = raw
    s.cache.set(display.id, cap)
    console.log(`[screenshot] captured ${cap.pixelWidth}x${cap.pixelHeight} + ${raw.length} windows in ${Date.now() - s.started}ms`)
    await presentSession(display, payloadFor(s, display, cap))
  } catch (err) {
    console.error('[screenshot] capture failed', err)
    if (session === s) endSession()
    dialog.showErrorBox('Screenshot failed', String((err as Error)?.message ?? err))
  }
}

/** Before a selection starts, follow the cursor to another display. */
async function followCursor(s: Session): Promise<void> {
  if (session !== s || !s.idle || s.switching) return
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (d.id === s.display.id) return
  s.switching = true
  try {
    const cap = s.cache.get(d.id) ?? await captureDisplay(d)
    if (session !== s) return
    s.cache.set(d.id, cap)
    s.display = d
    s.id = nextSessionId++
    hideOverlay()
    await presentSession(d, payloadFor(s, d, cap))
  } catch (err) {
    console.warn('[screenshot] switching display failed', err)
  } finally {
    s.switching = false
  }
}

/** Capture the other displays once the overlay is up, so following the cursor is instant. */
async function precaptureOthers(s: Session): Promise<void> {
  for (const d of screen.getAllDisplays()) {
    if (session !== s) return
    if (s.cache.has(d.id)) continue
    try { s.cache.set(d.id, await captureDisplay(d)) } catch { /* captured on demand instead */ }
  }
}

async function finish(r: { sessionId: number; action: Action; png: Uint8Array; rect: Rect; fileNamePrefix: string }): Promise<void> {
  const s = session
  if (!s || s.id !== r.sessionId) return
  const display = s.display
  endSession()
  const png = Buffer.from(r.png)
  const target = getLastFocusedLibraryWindow()
  const notify = (result: { action: Action; ok: boolean; detail?: string }) => {
    if (target && !target.isDestroyed()) target.webContents.send('screenshot:done', result)
  }
  try {
    if (r.action === 'copy') {
      copyPng(png)
      notify({ action: 'copy', ok: true })
    } else if (r.action === 'save') {
      const path = await savePng(png, r.fileNamePrefix)
      if (path) notify({ action: 'save', ok: true, detail: path })
    } else if (r.action === 'pin') {
      openPin(png, { x: display.bounds.x + r.rect.x, y: display.bounds.y + r.rect.y, w: r.rect.w, h: r.rect.h })
    } else if (r.action === 'insert' && target && !target.isDestroyed()) {
      target.webContents.send('screenshot:insert-into-note', png)
      target.show()
      target.focus()
    }
  } catch (err) {
    console.error('[screenshot] output failed', r.action, err)
    notify({ action: r.action, ok: false, detail: String((err as Error)?.message ?? err) })
  }
}

export function initScreenshot(): void {
  setOverlayGoneHandler(() => {
    if (session?.followTimer) clearInterval(session.followTimer)
    session = null
  })
  initHotkey(() => { void triggerCapture() })
  initPinIpc()
  ipcMain.handle('screenshot:trigger', () => triggerCapture())
  ipcMain.on('screenshot:page-ready', (e) => markPageReady(e.sender))
  ipcMain.on('screenshot:ready', (e, sessionId: number) => {
    const s = session
    if (!s || !isOverlaySender(e.sender) || s.id !== sessionId) return
    if (!revealOverlay(sessionId)) return
    console.log(`[screenshot] shown ${Date.now() - s.started}ms after the trigger`)
    if (!s.followTimer) {
      s.followTimer = setInterval(() => { void followCursor(s) }, FOLLOW_INTERVAL_MS)
      void precaptureOthers(s)
    }
  })
  ipcMain.on('screenshot:idle', (e, idle: boolean) => {
    if (session && isOverlaySender(e.sender)) session.idle = idle
  })
  ipcMain.on('screenshot:cancel', (e) => { if (isOverlaySender(e.sender)) endSession() })
  ipcMain.on('screenshot:finish', (e, r) => { if (isOverlaySender(e.sender)) void finish(r) })
  ipcMain.on('screenshot:insert-target', (e, ok: boolean) => {
    if (!insertTargets.has(e.sender.id)) e.sender.once('destroyed', () => insertTargets.delete(e.sender.id))
    insertTargets.set(e.sender.id, ok)
  })
  // Pre-warm after startup settles: the overlay page and the capturer.
  setTimeout(() => { prewarmOverlay(); void warmUpCapturer() }, PREWARM_DELAY_MS)
}

export function disposeScreenshot(): void {
  disposeHotkey()
  if (session?.followTimer) clearInterval(session.followTimer)
  session = null
  destroyOverlay()
  closeAllPins()
}
```

- [ ] **Step 3: 入口切换并删除旧服务**

`packages/app/src/main/index.ts` 第 7 行：

```ts
import { initScreenshot, disposeScreenshot } from './screenshot/index.js'
```

```bash
git rm packages/app/src/main/screenshot-service.ts
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p .`（在 `packages/app`）
Expected: 只剩 preload / 渲染端尚未更新导致的错误（下一个任务处理），主进程文件本身无错误

- [ ] **Step 5: Commit**

```bash
git add -A packages/app/src/main
git commit -m "feat(screenshot): 会话调度——并行截屏与窗口列表、显示后多屏跟随与预截、四种输出"
```

### Task 13: preload 与接口类型

**Files:**
- Modify: `packages/shared-ui/src/api.ts`（`screenshot?:` 一段）
- Modify: `packages/app/src/preload/index.ts`（`screenshot:` 一段）

- [ ] **Step 1: `api.ts` 增加会话类型并替换 `screenshot?:` 声明**

在 `export interface BanjuanAPI` 之前加：

```ts
/** One screenshot, handed from main to the overlay page (CSS px unless noted). */
export interface ScreenshotSession {
  sessionId: number
  /** BGRA, pixelWidth × pixelHeight × 4 */
  bitmap: Uint8Array
  pixelWidth: number
  pixelHeight: number
  cssWidth: number
  cssHeight: number
  /** Device px per CSS px of the bitmap. */
  scaleFactor: number
  workArea: { x: number; y: number; w: number; h: number }
  /** Click-to-select targets, frontmost first. */
  windows: Array<{ x: number; y: number; w: number; h: number }>
  canInsertNote: boolean
}
export type ScreenshotAction = 'copy' | 'save' | 'pin' | 'insert'
```

`screenshot?:` 替换为：

```ts
  /** Desktop only: Feishu-style screen capture. Absent on mobile. */
  screenshot?: {
    trigger: () => Promise<void>
    getHotkey?: () => Promise<{ hotkey: string; registered: boolean }>
    setHotkey?: (accel: string) => Promise<{ ok: boolean; hotkey: string; registered: boolean }>
    // Library window
    setInsertTarget?: (available: boolean) => void
    onInsertIntoNote?: (cb: (png: Uint8Array) => void) => () => void
    onDone?: (cb: (r: { action: ScreenshotAction; ok: boolean; detail?: string }) => void) => () => void
    // Overlay page
    onSession?: (cb: (s: ScreenshotSession) => void) => () => void
    onReset?: (cb: () => void) => () => void
    /** The overlay page has registered its listeners. */
    pageReady?: () => void
    ready?: (sessionId: number) => void
    setIdle?: (idle: boolean) => void
    finish?: (r: { sessionId: number; action: ScreenshotAction; png: Uint8Array; rect: { x: number; y: number; w: number; h: number }; fileNamePrefix: string }) => void
    cancel?: () => void
    // Pin window
    onPinInit?: (cb: (p: { png: Uint8Array }) => void) => () => void
    pinRequest?: () => void
    pinReady?: () => void
    pinMove?: (dx: number, dy: number) => void
    pinZoom?: (factor: number) => void
    pinClose?: () => void
    pinMenu?: (labels: { copy: string; save: string; close: string; fileNamePrefix: string }) => void
  }
```

并在 `packages/shared-ui/src/index.ts` 的 `export type { BanjuanAPI } from './api.js'` 改为：

```ts
export type { BanjuanAPI, ScreenshotSession, ScreenshotAction } from './api.js'
```

- [ ] **Step 2: preload 的 `screenshot:` 替换为**

```ts
  screenshot: {
    trigger: () => ipcRenderer.invoke('screenshot:trigger'),
    getHotkey: () => ipcRenderer.invoke('settings:getScreenshotHotkey') as Promise<{ hotkey: string; registered: boolean }>,
    setHotkey: (accel: string) => ipcRenderer.invoke('settings:setScreenshotHotkey', accel) as Promise<{ ok: boolean; hotkey: string; registered: boolean }>,
    setInsertTarget: (available: boolean) => ipcRenderer.send('screenshot:insert-target', available),
    onInsertIntoNote: (cb: (png: Uint8Array) => void) => listen('screenshot:insert-into-note', cb),
    onDone: (cb: (r: { action: 'copy' | 'save' | 'pin' | 'insert'; ok: boolean; detail?: string }) => void) => listen('screenshot:done', cb),
    onSession: (cb: (s: any) => void) => listen('screenshot:session', cb),
    onReset: (cb: () => void) => listen('screenshot:reset', cb),
    pageReady: () => ipcRenderer.send('screenshot:page-ready'),
    ready: (sessionId: number) => ipcRenderer.send('screenshot:ready', sessionId),
    setIdle: (idle: boolean) => ipcRenderer.send('screenshot:idle', idle),
    finish: (r: any) => ipcRenderer.send('screenshot:finish', r),
    cancel: () => ipcRenderer.send('screenshot:cancel'),
    onPinInit: (cb: (p: { png: Uint8Array }) => void) => listen('screenshot:pin-init', cb),
    pinRequest: () => ipcRenderer.send('screenshot:pin-request'),
    pinReady: () => ipcRenderer.send('screenshot:pin-ready'),
    pinMove: (dx: number, dy: number) => ipcRenderer.send('screenshot:pin-move', dx, dy),
    pinZoom: (factor: number) => ipcRenderer.send('screenshot:pin-zoom', factor),
    pinClose: () => ipcRenderer.send('screenshot:pin-close'),
    pinMenu: (labels: { copy: string; save: string; close: string; fileNamePrefix: string }) => ipcRenderer.send('screenshot:pin-menu', labels),
  },
```

并在 preload 顶部（`let closeTabHandler` 之前）加辅助函数：

```ts
/** Subscribe to a main → renderer channel; returns the unsubscribe function. */
function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => { ipcRenderer.removeListener(channel, handler) }
}
```

- [ ] **Step 3: 类型检查 shared-ui 与 app**

Run: `cd packages/shared-ui && npx tsc --noEmit -p .` 然后 `cd ../app && npx tsc --noEmit -p .`
Expected: shared-ui 0；app 只剩旧 `ScreenshotOverlay.tsx` 的错误（下一个任务删除）

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ui/src/api.ts packages/shared-ui/src/index.ts packages/app/src/preload/index.ts
git commit -m "feat(screenshot): preload 与接口类型——会话、结果通知、插入笔记、钉图"
```

---

## 阶段 C：渲染端

### Task 14: 独立入口与旧浮层移除

**Files:**
- Create: `packages/app/src/renderer/screenshot.html`
- Create: `packages/app/src/renderer/screenshot.tsx`
- Create: `packages/app/src/renderer/screenshot/bridge.ts`
- Modify: `packages/app/vite.config.ts`（`build` 段）
- Modify: `packages/app/src/renderer/App.tsx`（删掉第 4、18、43 行的浮层路由）
- Delete: `packages/app/src/renderer/views/ScreenshotOverlay.tsx`、`packages/app/src/renderer/screenshot/ops.ts`、`packages/app/src/renderer/screenshot/ops.test.ts`

- [ ] **Step 1: `screenshot.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Screenshot</title>
    <style>
      html, body { margin: 0; padding: 0; overflow: hidden; background: #000; user-select: none; -webkit-user-select: none; }
      body.pin { background: #fff; }
      #root { position: fixed; inset: 0; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./screenshot.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `screenshot/bridge.ts`**

```ts
import type { BanjuanAPI } from '@banjuan/shared-ui'

/** The preload bridge for the overlay and pin pages (all screenshot members exist on desktop). */
export type ScreenshotBridge = Required<NonNullable<BanjuanAPI['screenshot']>>
export const bridge: ScreenshotBridge = (window as any).electronAPI.screenshot
export type { ScreenshotSession, ScreenshotAction } from '@banjuan/shared-ui'
```

- [ ] **Step 3: `screenshot.tsx`**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@banjuan/shared-ui/src/i18n/index.js'
import Overlay from './screenshot/Overlay.js'
import Pin from './screenshot/Pin.js'

// Its own Vite entry: React + the i18n module only, not the 3MB main bundle.
const isPin = window.location.hash === '#pin'
if (isPin) document.body.classList.add('pin')
createRoot(document.getElementById('root')!).render(
  <I18nProvider>{isPin ? <Pin /> : <Overlay />}</I18nProvider>,
)
```

- [ ] **Step 4: `vite.config.ts` 的 `build` 改为多页面**

```ts
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        screenshot: resolve(__dirname, 'src/renderer/screenshot.html'),
      },
    },
  },
```

- [ ] **Step 5: 删除旧浮层与 App 路由**

`App.tsx` 删除 `import ScreenshotOverlay from './views/ScreenshotOverlay.js'`、`const IS_SCREENSHOT_OVERLAY = …`、`if (IS_SCREENSHOT_OVERLAY) return <ScreenshotOverlay />` 三行。

```bash
git rm packages/app/src/renderer/views/ScreenshotOverlay.tsx packages/app/src/renderer/screenshot/ops.ts packages/app/src/renderer/screenshot/ops.test.ts
```

（`Overlay.tsx`、`Pin.tsx` 在 Task 17、18 创建；本任务先不提交，与 Task 15–18 一起在 Task 18 末尾提交，避免中间状态无法编译。）

### Task 15: Magnifier

**Files:**
- Create: `packages/app/src/renderer/screenshot/Magnifier.tsx`

- [ ] **Step 1: 实现**

```tsx
import React, { useEffect, useRef } from 'react'
import { useT } from '@banjuan/shared-ui/src/i18n/index.js'
import { hexOf } from './bitmap.js'
import type { Point } from './geometry.js'

const ZOOM = 8
const CELLS = 15                    // odd: the centre cell is the pixel under the cursor
const SIZE = CELLS * ZOOM           // 120 css px
const OFFSET = 20

/** Colour of the device pixel under a CSS point of the capture canvas. */
export function colorAt(bg: HTMLCanvasElement, p: Point, scale: number): string {
  const ctx = bg.getContext('2d', { willReadFrequently: true })!
  const [r, g, b] = ctx.getImageData(Math.floor(p.x * scale), Math.floor(p.y * scale), 1, 1).data
  return hexOf(r, g, b)
}

/** 8× loupe next to the cursor with pixel coordinates and colour (C copies it). */
export function Magnifier({ bg, p, scale, bounds }: { bg: HTMLCanvasElement; p: Point; scale: number; bounds: { w: number; h: number } }) {
  const t = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  const dpr = window.devicePixelRatio || 1
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    const half = Math.floor(CELLS / 2)
    ctx.drawImage(bg, Math.floor(p.x * scale) - half, Math.floor(p.y * scale) - half, CELLS, CELLS, 0, 0, c.width, c.height)
    const cell = c.width / CELLS
    ctx.strokeStyle = 'rgba(0, 170, 255, 0.9)'
    ctx.lineWidth = dpr
    ctx.strokeRect(half * cell, half * cell, cell, cell)
  })
  const box = SIZE + 2
  const left = p.x + OFFSET + box > bounds.w ? p.x - OFFSET - box : p.x + OFFSET
  const top = p.y + OFFSET + box + 40 > bounds.h ? p.y - OFFSET - box - 40 : p.y + OFFSET
  return (
    <div style={{ position: 'absolute', left, top, pointerEvents: 'none', background: 'rgba(0,0,0,0.75)', borderRadius: 6, padding: 1, color: '#fff', font: '11px -apple-system, sans-serif' }}>
      <canvas ref={ref} width={SIZE * dpr} height={SIZE * dpr} style={{ width: SIZE, height: SIZE, display: 'block', borderRadius: 5 }} />
      <div style={{ padding: '4px 6px', lineHeight: 1.5 }}>
        <div>{Math.floor(p.x * scale)}, {Math.floor(p.y * scale)}</div>
        <div>{colorAt(bg, p, scale)} · {t('screenshot.magnifierHint')}</div>
      </div>
    </div>
  )
}
```

### Task 16: Toolbar

**Files:**
- Create: `packages/app/src/renderer/screenshot/Toolbar.tsx`

- [ ] **Step 1: 实现**

```tsx
import React, { forwardRef } from 'react'
import { Square, Circle, MoveUpRight, Pencil, Highlighter, Type, Grid3x3, Undo2, Redo2, Pin, Download, FileInput, X, Check } from 'lucide-react'
import { useT, type MessageKey } from '@banjuan/shared-ui/src/i18n/index.js'
import { COLORS, WIDTHS, FONT_SIZES, type ShapeStyle, type ToolKind } from './shapes.js'

const TOOLS: Array<{ kind: ToolKind; label: MessageKey; icon: React.ReactNode }> = [
  { kind: 'rect', label: 'screenshot.toolRect', icon: <Square size={16} /> },
  { kind: 'ellipse', label: 'screenshot.toolEllipse', icon: <Circle size={16} /> },
  { kind: 'arrow', label: 'screenshot.toolArrow', icon: <MoveUpRight size={16} /> },
  { kind: 'pen', label: 'screenshot.toolPen', icon: <Pencil size={16} /> },
  { kind: 'highlighter', label: 'screenshot.toolHighlighter', icon: <Highlighter size={16} /> },
  { kind: 'text', label: 'screenshot.toolText', icon: <Type size={16} /> },
  { kind: 'mosaic', label: 'screenshot.toolMosaic', icon: <Grid3x3 size={16} /> },
  { kind: 'number', label: 'screenshot.toolNumber', icon: <span style={{ fontSize: 14, lineHeight: '16px' }}>①</span> },
]

export interface ToolbarProps {
  tool: ToolKind | null
  onTool: (t: ToolKind | null) => void
  style: ShapeStyle
  onStyle: (s: ShapeStyle) => void
  /** Style panel shown for this kind (the active tool, or the selected shape); null hides it. */
  styleFor: ToolKind | null
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  canInsert: boolean
  onAction: (a: 'pin' | 'save' | 'insert' | 'copy') => void
  onCancel: () => void
  busy: boolean
}

const btn = (active: boolean, disabled = false): React.CSSProperties => ({
  width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', padding: 0,
  background: active ? '#e8f0fe' : 'transparent', color: disabled ? '#bbb' : active ? '#1a73e8' : '#333',
})
const divider = <div style={{ width: 1, alignSelf: 'stretch', margin: '4px 2px', background: '#e5e5e5' }} />

/** Tools | undo redo | pin save insert | cancel done — with the style panel underneath when relevant. */
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(p, ref) {
  const t = useT()
  return (
    <div ref={ref} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.25)', padding: 4, font: '12px -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {TOOLS.map(x => (
          <button key={x.kind} title={t(x.label)} style={btn(p.tool === x.kind)} onClick={() => p.onTool(p.tool === x.kind ? null : x.kind)}>{x.icon}</button>
        ))}
        {divider}
        <button title={t('screenshot.undo')} style={btn(false, !p.canUndo)} disabled={!p.canUndo} onClick={p.onUndo}><Undo2 size={16} /></button>
        <button title={t('screenshot.redo')} style={btn(false, !p.canRedo)} disabled={!p.canRedo} onClick={p.onRedo}><Redo2 size={16} /></button>
        {divider}
        <button title={t('screenshot.pin')} style={btn(false, p.busy)} disabled={p.busy} onClick={() => p.onAction('pin')}><Pin size={16} /></button>
        <button title={t('screenshot.save')} style={btn(false, p.busy)} disabled={p.busy} onClick={() => p.onAction('save')}><Download size={16} /></button>
        <button title={p.canInsert ? t('screenshot.insertNote') : t('screenshot.insertUnavailable')} style={btn(false, !p.canInsert || p.busy)}
          disabled={!p.canInsert || p.busy} onClick={() => p.onAction('insert')}><FileInput size={16} /></button>
        {divider}
        <button title={t('screenshot.cancel')} style={btn(false)} onClick={p.onCancel}><X size={16} /></button>
        <button title={t('screenshot.done')} style={{ ...btn(false, p.busy), background: '#1a73e8', color: '#fff' }} disabled={p.busy} onClick={() => p.onAction('copy')}><Check size={16} /></button>
      </div>
      {p.styleFor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px 2px', borderTop: '1px solid #eee', marginTop: 4 }}>
          {p.styleFor === 'text'
            ? FONT_SIZES.map((s, i) => (
                <button key={s} title={t('screenshot.fontSize')} style={{ ...btn(p.style.fontSize === s), width: 26, height: 22, fontSize: 11 + i * 2 }} onClick={() => p.onStyle({ ...p.style, fontSize: s })}>A</button>
              ))
            : WIDTHS.map(w => (
                <button key={w} title={t('screenshot.size')} style={{ ...btn(p.style.width === w), width: 26, height: 22 }} onClick={() => p.onStyle({ ...p.style, width: w })}>
                  <span style={{ width: w + 3, height: w + 3, borderRadius: '50%', background: '#333' }} />
                </button>
              ))}
          <div style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 2px' }} />
          {COLORS.map(c => (
            <button key={c} title={t('screenshot.color')} onClick={() => p.onStyle({ ...p.style, color: c })}
              style={{ width: 18, height: 18, borderRadius: 4, cursor: 'pointer', padding: 0, background: c, border: p.style.color === c ? '2px solid #1a73e8' : '1px solid #ccc' }} />
          ))}
        </div>
      )}
    </div>
  )
})
```

### Task 17: Overlay

**Files:**
- Create: `packages/app/src/renderer/screenshot/Overlay.tsx`

- [ ] **Step 1: 实现**

```tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@banjuan/shared-ui/src/i18n/index.js'
import { isUsableSelection, normalizeRect, clampPoint, pointInRect, placeToolbar, type Point, type Rect } from './geometry.js'
import { idleState, pointerDown as selDown, pointerMove as selMove, pointerUp as selUp, nudge as selNudge, escape as selEscape, rightClick as selRightClick, currentRect, cursorFor, handlePoint, HANDLES, type SelState, type Env } from './selection.js'
import { renderShapes, shapeAt, shapeBounds, translateShape, nextNumber, newShapeId, type Shape, type ShapeStyle, type ToolKind } from './shapes.js'
import { initHistory, commit, undo, redo, canUndo, canRedo, type History } from './history.js'
import { bgraToRgba } from './bitmap.js'
import { composeRegion, canvasToPng } from './compose.js'
import { loadStyle, saveStyle } from './prefs.js'
import { Magnifier, colorAt } from './Magnifier.js'
import { Toolbar } from './Toolbar.js'
import { bridge, type ScreenshotSession, type ScreenshotAction } from './bridge.js'

const DIM = 'rgba(0,0,0,0.45)'
const ACCENT = '#1a73e8'
type TextDraft = { at: Point; value: string; editingId: string | null }

/** Error panel: a crash shows a readable message and always offers a way out. */
function ErrorPanel({ text }: { text: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') bridge.cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div onClick={() => bridge.cancel()} style={{ position: 'fixed', inset: 0, background: '#111', color: '#fff', padding: 24, font: '12px ui-monospace, monospace', whiteSpace: 'pre-wrap', overflow: 'auto', cursor: 'pointer', zIndex: 99999 }}>
      {'[screenshot overlay error — click or Esc to close]\n\n' + text}
    </div>
  )
}

class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: any) { return { err: String(e?.stack || e?.message || e) } }
  render() { return this.state.err ? <ErrorPanel text={this.state.err} /> : this.props.children }
}

export default function Overlay() {
  return <Boundary><OverlayInner /></Boundary>
}

function OverlayInner() {
  const t = useT()
  const bgRef = useRef<HTMLCanvasElement>(null)
  const shapesRef = useRef<HTMLCanvasElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<ScreenshotSession | null>(null)
  const [asyncErr, setAsyncErr] = useState<string | null>(null)
  const [sel, setSel] = useState<SelState>(idleState())
  const [tool, setTool] = useState<ToolKind | null>(null)
  const [hist, setHist] = useState<History<Shape[]>>(initHistory([]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [style, setStyle] = useState<ShapeStyle>(loadStyle)
  const [draft, setDraft] = useState<Shape | null>(null)
  const [moving, setMoving] = useState<Shape | null>(null)
  const [text, setText] = useState<TextDraft | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [barSize, setBarSize] = useState({ w: 420, h: 40 })
  const anchor = useRef<Point | null>(null)
  const moveStart = useRef<{ start: Point; origin: Shape } | null>(null)
  const shapes = hist.present

  const reset = useCallback(() => {
    setSel(idleState()); setTool(null); setHist(initHistory([])); setSelectedId(null)
    setDraft(null); setMoving(null); setText(null); setPointer(null); setNotice(null); setBusy(false)
  }, [])

  // A session arrives: paint the capture first, then tell main it may show the window.
  // Listeners first, then announce the page — main waits for that before sending a session.
  useEffect(() => {
    const offSession = bridge.onSession(s => {
      const c = bgRef.current!
      c.width = s.pixelWidth
      c.height = s.pixelHeight
      c.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(bgraToRgba(s.bitmap), s.pixelWidth, s.pixelHeight), 0, 0)
      reset()
      setSession(s)
      requestAnimationFrame(() => requestAnimationFrame(() => bridge.ready(s.sessionId)))
    })
    const offReset = bridge.onReset(() => { reset(); setSession(null) })
    bridge.pageReady()
    return () => { offSession(); offReset() }
  }, [reset])

  // Event-handler / async errors aren't caught by the error boundary.
  useEffect(() => {
    const onErr = (e: ErrorEvent) => setAsyncErr(String(e.error?.stack || e.message))
    const onRej = (e: PromiseRejectionEvent) => setAsyncErr(String(e.reason?.stack || e.reason?.message || e.reason))
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])

  const bounds = useMemo<Rect>(() => ({ x: 0, y: 0, w: session?.cssWidth ?? window.innerWidth, h: session?.cssHeight ?? window.innerHeight }), [session])
  const locked = shapes.length > 0 || !!text
  const env = useMemo<Env>(() => ({ bounds, windows: [...(session?.windows ?? []), bounds], locked }), [bounds, session, locked])
  const region = currentRect(sel)
  const regionReady = sel.mode === 'selected' && isUsableSelection(region)

  // Main follows the cursor to another display only while nothing is being selected.
  useEffect(() => { if (session) bridge.setIdle(sel.mode === 'idle') }, [sel.mode, session])

  const updateStyle = (s: ShapeStyle) => {
    setStyle(s)
    saveStyle(s)
    if (selectedId) setHist(h => commit(h, h.present.map(x => (x.id === selectedId ? { ...x, style: s } : x))))
  }

  const commitText = useCallback(() => {
    setText(cur => {
      if (cur) {
        const value = cur.value.trim()
        setHist(h => {
          if (cur.editingId) {
            return commit(h, value ? h.present.map(s => (s.id === cur.editingId && s.kind === 'text' ? { ...s, text: value } : s)) : h.present.filter(s => s.id !== cur.editingId))
          }
          return value ? commit(h, [...h.present, { id: newShapeId(), kind: 'text', style, at: cur.at, text: value }]) : h
        })
      }
      return null
    })
  }, [style])

  const finish = useCallback(async (action: ScreenshotAction) => {
    if (!session || !regionReady || !region || busy) return
    if (action === 'insert' && !session.canInsertNote) return
    setBusy(true)
    try {
      // An open text box is part of the image too.
      const pending: Shape[] = text?.value.trim() && !text.editingId ? [{ id: 'pending', kind: 'text', style, at: text.at, text: text.value.trim() }] : []
      const out = composeRegion(bgRef.current!, region, [...shapes, ...pending], session.scaleFactor)
      const png = await canvasToPng(out)
      bridge.finish({ sessionId: session.sessionId, action, png, rect: region, fileNamePrefix: t('screenshot.fileName') })
    } catch (err) {
      console.error('[screenshot] compose failed', err)
      bridge.cancel()
    } finally {
      setBusy(false)
    }
  }, [session, regionReady, region, busy, text, style, shapes, t])

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(n => (n === msg ? null : n)), 1500) }
  const magnifierOn = !!session && !!pointer && (sel.mode === 'idle' || sel.mode === 'dragging' || sel.mode === 'resizing')

  const escapeLadder = useCallback(() => {
    if (tool) { setTool(null); return }
    if (selectedId) { setSelectedId(null); return }
    const next = selEscape(sel, locked)
    if (next === null) bridge.cancel()
    else setSel(next)
  }, [tool, selectedId, sel, locked])

  // Keyboard: Esc ladder, Enter/⌘C copy, ⌘S save, ⌘Z/⇧⌘Z, Delete, arrows, C = copy colour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!session) { if (e.key === 'Escape') bridge.cancel(); return }   // Esc always gets out
      if (text) return   // the text box handles its own keys
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (e.key === 'Escape') { e.preventDefault(); escapeLadder(); return }
      if (e.key === 'Enter' || (mod && key === 'c')) { e.preventDefault(); void finish('copy'); return }
      if (mod && key === 's') { e.preventDefault(); void finish('save'); return }
      if (mod && key === 'z') { e.preventDefault(); setHist(h => (e.shiftKey ? redo(h) : undo(h))); setSelectedId(null); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setHist(h => commit(h, h.present.filter(s => s.id !== selectedId)))
        setSelectedId(null)
        return
      }
      if (!mod && key === 'c' && magnifierOn && pointer && bgRef.current) {
        const hex = colorAt(bgRef.current, pointer, session.scaleFactor)
        void navigator.clipboard.writeText(hex).then(() => flash(t('screenshot.colorCopied', hex)))
        return
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (e.key in arrows) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const [dx, dy] = arrows[e.key].map(v => v * step)
        if (selectedId) setHist(h => commit(h, h.present.map(s => (s.id === selectedId ? translateShape(s, dx, dy) : s))))
        else setSel(s => selNudge(s, dx, dy, env))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pt = (e: React.PointerEvent | React.MouseEvent): Point => ({ x: e.clientX, y: e.clientY })

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !session) return
    const p = pt(e)
    if (text) { commitText(); return }
    if (regionReady && region && tool && pointInRect(p, region)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      const q = clampPoint(p, region)
      const id = newShapeId()
      anchor.current = q
      setSelectedId(null)
      if (tool === 'text') { setText({ at: q, value: '', editingId: null }); return }
      if (tool === 'number') { setHist(h => commit(h, [...h.present, { id, kind: 'number', style, at: q, n: nextNumber(h.present) }])); return }
      if (tool === 'rect' || tool === 'ellipse') setDraft({ id, kind: tool, style, rect: { x: q.x, y: q.y, w: 0, h: 0 } })
      else if (tool === 'arrow') setDraft({ id, kind: 'arrow', style, tail: q, head: q })
      else setDraft({ id, kind: tool, style, points: [q] })
      return
    }
    if (regionReady && region && !tool) {
      const hit = shapeAt(shapes, p)
      if (hit) {
        e.currentTarget.setPointerCapture(e.pointerId)
        setSelectedId(hit.id)
        moveStart.current = { start: p, origin: hit }
        return
      }
      if (selectedId) setSelectedId(null)
    }
    if (locked) return   // an annotated region can't be re-selected
    e.currentTarget.setPointerCapture(e.pointerId)
    setSel(s => selDown(s, p, env))
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pt(e)
    setPointer(p)
    if (draft && region) {
      const q = clampPoint(p, region)
      if (draft.kind === 'rect' || draft.kind === 'ellipse') setDraft({ ...draft, rect: normalizeRect(anchor.current!, q) })
      else if (draft.kind === 'arrow') setDraft({ ...draft, head: q })
      else if (draft.kind === 'pen' || draft.kind === 'highlighter' || draft.kind === 'mosaic') setDraft({ ...draft, points: [...draft.points, q] })
      return
    }
    if (moveStart.current) {
      const { start, origin } = moveStart.current
      setMoving(translateShape(origin, p.x - start.x, p.y - start.y))
      return
    }
    setSel(s => selMove(s, p, env))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pt(e)
    if (draft) {
      const b = shapeBounds(draft)
      const meaningful = draft.kind === 'pen' || draft.kind === 'highlighter' || draft.kind === 'mosaic'
        ? draft.points.length > 1
        : b.w > 6 || b.h > 6
      if (meaningful) setHist(h => commit(h, [...h.present, draft]))
      setDraft(null)
      return
    }
    if (moveStart.current) {
      const moved = moving
      moveStart.current = null
      setMoving(null)
      if (moved) setHist(h => commit(h, h.present.map(s => (s.id === moved.id ? moved : s))))
      return
    }
    setSel(s => selUp(s, p, env))
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!regionReady || !region || tool) return
    const p = pt(e)
    const hit = shapeAt(shapes, p)
    if (hit?.kind === 'text') { setSelectedId(null); setText({ at: hit.at, value: hit.text, editingId: hit.id }); return }
    if (pointInRect(p, region)) void finish('copy')
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (text) { commitText(); return }
    if (selectedId) { setSelectedId(null); return }
    if (locked) { bridge.cancel(); return }
    const next = selRightClick(sel)
    if (next === null) bridge.cancel()
    else setSel(next)
  }

  // Shapes layer: device-crisp canvas over the selection.
  const visible = useMemo(() => {
    let list = moving ? shapes.map(s => (s.id === moving.id ? moving : s)) : shapes
    if (text?.editingId) list = list.filter(s => s.id !== text.editingId)
    return draft ? [...list, draft] : list
  }, [shapes, moving, draft, text])

  useEffect(() => {
    const c = shapesRef.current
    if (!c || !region || !session) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, Math.round(region.w * dpr))
    c.height = Math.max(1, Math.round(region.h * dpr))
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.save()
    ctx.translate(-region.x * dpr, -region.y * dpr)
    renderShapes(ctx, visible, { scale: dpr, background: bgRef.current!, backgroundScale: session.scaleFactor })
    ctx.restore()
  })

  useLayoutEffect(() => {
    const b = toolbarRef.current
    if (b && (b.offsetWidth !== barSize.w || b.offsetHeight !== barSize.h)) setBarSize({ w: b.offsetWidth, h: b.offsetHeight })
  })

  if (asyncErr) return <ErrorPanel text={asyncErr} />

  const focusRect = region ?? (sel.mode === 'idle' ? sel.hover : null)
  const selectedShape = selectedId ? visible.find(s => s.id === selectedId) ?? null : null
  const styleFor: ToolKind | null = tool ?? selectedShape?.kind ?? null
  const sf = session?.scaleFactor ?? 1
  const barPos = regionReady && region && session ? placeToolbar(region, barSize, session.workArea) : null
  const cursor = tool && regionReady ? 'crosshair' : cursorFor(sel, pointer, env)

  return (
    <div style={{ position: 'fixed', inset: 0, cursor, visibility: session ? 'visible' : 'hidden' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
      <canvas ref={bgRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {/* Dim outside the focus rect with four plain rects — a full-screen clip-path
          animated every frame can wedge the macOS compositor. */}
      {focusRect ? (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, focusRect.y), background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: focusRect.y + focusRect.h, right: 0, bottom: 0, background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: focusRect.y, width: Math.max(0, focusRect.x), height: focusRect.h, background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: focusRect.x + focusRect.w, top: focusRect.y, right: 0, height: focusRect.h, background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: focusRect.x, top: focusRect.y, width: focusRect.w, height: focusRect.h, border: `${region ? 1 : 2}px solid ${ACCENT}`, boxSizing: 'border-box', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: focusRect.x, top: focusRect.y > 24 ? focusRect.y - 22 : focusRect.y + 4, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', font: '11px -apple-system, sans-serif', pointerEvents: 'none' }}>
            {Math.round(focusRect.w * sf)} × {Math.round(focusRect.h * sf)}
          </div>
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: DIM, pointerEvents: 'none' }} />
      )}
      {region && (
        <canvas ref={shapesRef} style={{ position: 'absolute', left: region.x, top: region.y, width: region.w, height: region.h, pointerEvents: 'none' }} />
      )}
      {regionReady && region && !locked && HANDLES.map(h => {
        const q = handlePoint(region, h)
        return <div key={h} style={{ position: 'absolute', left: q.x - 4, top: q.y - 4, width: 8, height: 8, background: '#fff', border: `1px solid ${ACCENT}`, boxSizing: 'border-box', pointerEvents: 'none' }} />
      })}
      {selectedShape && (() => {
        const b = shapeBounds(selectedShape)
        return <div style={{ position: 'absolute', left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, border: `1px dashed ${ACCENT}`, pointerEvents: 'none' }} />
      })()}
      {text && (
        <input autoFocus value={text.value}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => setText({ ...text, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={e => {
            // Enter / Esc act on the text box only, never on the whole screenshot.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.stopPropagation(); commitText() }
            if (e.key === 'Escape') { e.stopPropagation(); setText(null) }
          }}
          style={{ position: 'absolute', left: text.at.x, top: text.at.y, minWidth: 40, font: `${style.fontSize}px -apple-system, "PingFang SC", sans-serif`, color: style.color, background: 'rgba(255,255,255,0.15)', border: `1px dashed ${style.color}`, outline: 'none', padding: 0 }} />
      )}
      {barPos && (
        <div style={{ position: 'absolute', left: barPos.x, top: barPos.y }}>
          <Toolbar ref={toolbarRef} tool={tool} onTool={x => { setTool(x); setSelectedId(null) }} style={style} onStyle={updateStyle} styleFor={styleFor}
            canUndo={canUndo(hist)} canRedo={canRedo(hist)}
            onUndo={() => { setHist(undo); setSelectedId(null) }} onRedo={() => { setHist(redo); setSelectedId(null) }}
            canInsert={!!session?.canInsertNote} onAction={a => { void finish(a) }} onCancel={() => bridge.cancel()} busy={busy} />
        </div>
      )}
      {magnifierOn && bgRef.current && <Magnifier bg={bgRef.current} p={pointer!} scale={sf} bounds={bounds} />}
      {notice && (
        <div style={{ position: 'absolute', left: '50%', top: 24, transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.75)', color: '#fff', font: '12px -apple-system, sans-serif', pointerEvents: 'none' }}>{notice}</div>
      )}
    </div>
  )
}
```

### Task 18: Pin，并提交阶段 C 前半

**Files:**
- Create: `packages/app/src/renderer/screenshot/Pin.tsx`

- [ ] **Step 1: 实现**

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { useT } from '@banjuan/shared-ui/src/i18n/index.js'
import { bridge } from './bridge.js'

/** A pinned screenshot: drag to move, wheel to zoom, double-click or Esc to close, right-click for copy / save / close. */
export default function Pin() {
  const t = useT()
  const [url, setUrl] = useState<string | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const off = bridge.onPinInit(({ png }) => setUrl(URL.createObjectURL(new Blob([png], { type: 'image/png' }))))
    bridge.pinRequest()
    return off
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') bridge.pinClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!url) return null
  return (
    <img src={url} draggable={false}
      onLoad={e => { void e.currentTarget.decode().catch(() => {}).then(() => bridge.pinReady()) }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); last.current = { x: e.screenX, y: e.screenY } }}
      onPointerMove={e => {
        if (!last.current || !e.buttons) return
        const dx = e.screenX - last.current.x, dy = e.screenY - last.current.y
        if (dx || dy) { bridge.pinMove(dx, dy); last.current = { x: e.screenX, y: e.screenY } }
      }}
      onPointerUp={() => { last.current = null }}
      onDoubleClick={() => bridge.pinClose()}
      onWheel={e => bridge.pinZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
      onContextMenu={e => {
        e.preventDefault()
        bridge.pinMenu({ copy: t('screenshot.pinCopy'), save: t('screenshot.save'), close: t('screenshot.pinClose'), fileNamePrefix: t('screenshot.fileName') })
      }}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block', cursor: 'move', userSelect: 'none' }} />
  )
}
```

- [ ] **Step 2: 补文案（Task 19 的 key 先加上才能通过类型检查）** —— 先执行 Task 19 的 Step 1，再继续。

- [ ] **Step 3: 类型检查与单测**

Run: `npx tsc --noEmit -p .` 与 `npx vitest run`（均在 `packages/app`）
Expected: 0 错误；全部测试通过

- [ ] **Step 4: Commit**

```bash
git add -A packages/app/src/renderer packages/app/vite.config.ts
git commit -m "feat(screenshot): 独立的截图页面——窗口识别、可调选区、放大镜、8 种可编辑标注、钉图窗口"
```

### Task 19: 文案（7 种语言）

**Files:**
- Modify: `packages/shared-ui/src/i18n/{zh,en,ja,ko,fr,de,es}.ts`

- [ ] **Step 1: 用合并脚本加入下列 key**（与本仓库其他批次相同：写 JSON，运行 `scratchpad/i18n-batch/merge.py`）

| key | zh | en |
|---|---|---|
| screenshot.toolRect | 矩形 | Rectangle |
| screenshot.toolEllipse | 椭圆 | Ellipse |
| screenshot.toolArrow | 箭头 | Arrow |
| screenshot.toolPen | 画笔 | Pen |
| screenshot.toolHighlighter | 荧光笔 | Highlighter |
| screenshot.toolText | 文字 | Text |
| screenshot.toolMosaic | 马赛克 | Mosaic |
| screenshot.toolNumber | 序号 | Number |
| screenshot.undo | 撤销 | Undo |
| screenshot.redo | 重做 | Redo |
| screenshot.pin | 钉在屏幕上 | Pin to screen |
| screenshot.save | 保存 | Save |
| screenshot.insertNote | 插入当前笔记 | Insert into current note |
| screenshot.insertUnavailable | 先打开一篇文本笔记才能插入 | Open a text note to insert into it |
| screenshot.cancel | 取消 | Cancel |
| screenshot.done | 完成（复制） | Done (copy) |
| screenshot.fontSize | 字号 | Font size |
| screenshot.size | 粗细 | Thickness |
| screenshot.color | 颜色 | Color |
| screenshot.magnifierHint | 按 C 复制颜色 | Press C to copy |
| screenshot.colorCopied | 已复制颜色 {0} | Copied {0} |
| screenshot.fileName | 截图 | Screenshot |
| screenshot.copied | 截图已复制 | Screenshot copied |
| screenshot.saved | 截图已保存到 {0} | Screenshot saved to {0} |
| screenshot.failed | 截图操作失败：{0} | Screenshot failed: {0} |
| screenshot.inserted | 截图已插入笔记 | Screenshot inserted into the note |
| screenshot.insertFailed | 插入截图失败：{0} | Couldn't insert the screenshot: {0} |
| screenshot.pinCopy | 复制 | Copy |
| screenshot.pinClose | 关闭 | Close |

ja / ko / fr / de / es 同样补齐（语义同上，界面风格与各语言文件现有条目一致）。

- [ ] **Step 2: 类型检查并提交**

Run: `cd packages/shared-ui && npx tsc --noEmit -p .`
Expected: 0 错误

```bash
git add packages/shared-ui/src/i18n
git commit -m "feat(i18n): 截图工具栏、钉图与结果提示文案（7 种语言）"
```

### Task 20: 主界面接入（插入笔记、结果提示）

**Files:**
- Modify: `packages/shared-ui/src/components/notes/BlockEditor.tsx`（`BlockEditorHandle` 与 `useImperativeHandle`）
- Modify: `packages/shared-ui/src/views/NoteView.tsx`（`NoteViewInner`）
- Modify: `packages/shared-ui/src/components/TabManager.tsx`

- [ ] **Step 1: `BlockEditorHandle` 增加 `insertImage`**

```ts
export interface BlockEditorHandle {
  exportMarkdown: () => Promise<{ markdown: string; files: Array<{ name: string; dataUrl: string }> }>
  exportHTML: () => Promise<string>
  getAttachmentPaths: () => string[]
  /** Save `file` as an attachment of this note and insert it as an image after the cursor's block. */
  insertImage: (file: File) => Promise<void>
}
```

`useImperativeHandle` 中加入：

```ts
    insertImage: async (file: File) => {
      const url = await handleUploadFileRef.current(file)
      if (!url) return
      const at = editor.getTextCursorPosition().block
      editor.insertBlocks([{ type: 'image', props: { url } } as any], at, 'after')
    },
```

- [ ] **Step 2: `NoteViewInner` 接收截图**（`editorRef` 与 `api` 已在该组件内；`toast`、`errorMessage` 已导入）

```ts
  const isActiveTab = useIsActiveTab()
  const isActiveRef = useRef(isActiveTab)
  isActiveRef.current = isActiveTab
  // Screenshot "insert into note": only the note in the active tab takes it.
  useEffect(() => api.screenshot?.onInsertIntoNote?.(async (png) => {
    if (!isActiveRef.current || !editorRef.current) return
    try {
      await editorRef.current.insertImage(new File([png], `screenshot-${Date.now()}.png`, { type: 'image/png' }))
      toast.success(t('screenshot.inserted'))
    } catch (e) {
      toast.error(t('screenshot.insertFailed', errorMessage(e)))
    }
  }), [api, t])
```

（若 `NoteViewInner` 已有 `useIsActiveTab()` 调用则复用该变量；`useIsActiveTab` 从 `../components/tabActive.js` 导入。）

- [ ] **Step 3: `TabManager` 上报插入目标并显示结果提示**（在 `publishContext` 相关 effect 之后）

```ts
  // Tell main whether the active tab can take "insert screenshot into note".
  useEffect(() => {
    const tab = tabs.find(x => x.id === activeTabId)
    const ok = tab?.type === 'note' && (tabData.get(tab.id)?.type ?? 'markdown') === 'markdown'
    api.screenshot?.setInsertTarget?.(ok)
  }, [api, tabs, activeTabId, tabData])

  useEffect(() => api.screenshot?.onDone?.(r => {
    if (!r.ok) toast.error(t('screenshot.failed', r.detail ?? ''))
    else if (r.action === 'copy') toast.success(t('screenshot.copied'))
    else if (r.action === 'save') toast.success(t('screenshot.saved', r.detail ?? ''))
  }), [api, t])
```

并在 `TabManager.tsx` 导入 `toast`：

```ts
import { toast } from './feedback.js'
```

- [ ] **Step 4: 类型检查并提交**

Run: `npx tsc --noEmit -p .`（shared-ui、app、mobile 各一次）
Expected: 0 错误

```bash
git add packages/shared-ui/src
git commit -m "feat(screenshot): 截图可插入当前笔记光标处，主窗口显示复制 / 保存结果"
```

---

## 阶段 D：验证

### Task 21: 端到端回归与耗时测量

**Files:**
- Create（scratchpad，不入库）: `scratchpad/h3/run.sh`、`scratchpad/h3/main/harness.cjs`

- [ ] **Step 1: 构建**

Run: `cd packages/app && rm -rf dist && pnpm run build`
Expected: `dist/renderer/screenshot.html` 存在；`ls dist/renderer/assets | grep screenshot` 的入口 JS 明显小于主包

- [ ] **Step 2: harness**——沿用 `scratchpad/h2` 的结构：esbuild 把 `src/main/screenshot/index.ts` 打成 `main/svc.cjs`（`--external:electron`），软链 `dist/preload`、`dist/renderer`，`HOME` 指向 scratchpad；`harness.cjs` 用一个隐藏的 host 窗口调用 `electronAPI.screenshot.trigger()`，覆盖以下场景，每项打印结果：
  1. **耗时**：trigger → 浮层可见（`isVisible()`）的毫秒数，连续 5 次（第 1 次在预热前、之后在预热后）；目标预热后 ≤ 350ms。
  2. **框选 + 复制**：`sendInputEvent` 模拟拖拽（`mouseDown`/`mouseMove`/`mouseUp`，`modifiers: ['leftButtonDown']`），回车；剪贴板图片尺寸 = 选区 × scaleFactor。
  3. **窗口点选**：在一个已知窗口内单击（不拖动），选区等于该窗口在本屏的矩形。
  4. **标注 + 撤销重做**：选矩形工具画一个，⌘Z 后合成图与无标注相同，⇧⌘Z 后恢复。
  5. **保存**：harness 里替换 `dialog.showSaveDialog` 返回临时路径，文件存在且为 PNG。
  6. **钉图**：动作 pin 后出现一个置顶小窗口，尺寸 = 选区 CSS 尺寸；滚轮放大后宽度变为 1.1 倍；双击关闭。
  7. **复用**：连续 3 次截图只创建过 1 个浮层窗口（`BrowserWindow.getAllWindows()` 计数）。
  8. **Esc 逐级**：选区后 Esc → 选区消失但浮层还在；再 Esc → 浮层隐藏。

- [ ] **Step 3: 运行并修复**

Run: `sh scratchpad/h3/run.sh`
Expected: 8 个场景全部符合预期；不符合的按 systematic-debugging 定位修复后重跑

- [ ] **Step 4: 插入笔记在真实应用里验证**：开发版（`--user-data-dir` 隔离）打开一篇文本笔记，调用截图并选"插入笔记"，笔记中出现图片块、附件目录出现 PNG。

### Task 22: 全量校验、打包安装

- [ ] **Step 1:** `pnpm verify`（根目录）→ 全部类型检查与测试通过
- [ ] **Step 2:** 合并到 `integrate/local-test`，`packages/app` 下 `pnpm run build && node scripts/bundle-cli.mjs && npx electron-builder --dir --mac --arm64`，确认 arm64 与签名，替换安装 `/Applications/半卷.app`，冒烟测试（`banjuan status`、真实截一次图）。
- [ ] **Step 3:** 汇报：耗时对比（改造前 vs 后）、功能清单、已知限制。
