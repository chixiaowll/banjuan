/**
 * Geometry for the ink lasso shared by the PDF, EPUB and Markdown viewers.
 * Each viewer stores ink in its own coordinates (PDF: fractions of the page;
 * Markdown: fraction of the width × pixels down; EPUB: fraction of the width ×
 * document pixels). The lasso works in a "work space" of CSS pixels that the
 * viewer maps to and from (see useInkLasso); everything here is plain math.
 */

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface InkStroke {
  points: Point[]
  color: string
  width: number
}

/** One ink annotation: its stored position (kept as is apart from strokes/bounds) and strokes. */
export interface InkEntry {
  annotationId: string
  position: Record<string, unknown>
  strokes: InkStroke[]
}

/** Ink annotations among `annotations` (optionally narrowed, e.g. to one page). */
export function inkEntries(annotations: any[], filter?: (a: any) => boolean): InkEntry[] {
  return annotations
    .filter(a => a?.position?.type === 'ink' && Array.isArray(a.position.strokes) && (!filter || filter(a)))
    .map(a => ({ annotationId: a.id, position: a.position, strokes: a.position.strokes }))
}

/** Every stroke of every entry, in order — selection indices refer to this list. */
export function flattenStrokes(entries: InkEntry[]): InkStroke[] {
  return entries.flatMap(e => e.strokes)
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function boundsOf(points: Iterable<Point>): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The `bounds` stored with an ink annotation. */
export function strokeBounds(strokes: InkStroke[]): Rect {
  return boundsOf(strokes.flatMap(s => s.points)) ?? { x: 0, y: 0, w: 0, h: 0 }
}

/** Strokes (by index) with any point inside the lasso. `work[i]` = stroke i's points in work space. */
export function selectInLasso(work: Point[][], lasso: Point[]): Set<number> {
  const sel = new Set<number>()
  if (lasso.length < 3) return sel
  work.forEach((pts, i) => { if (pts.some(p => pointInPolygon(p, lasso))) sel.add(i) })
  return sel
}

export function selectionBounds(work: Point[][], sel: Set<number>): Rect | null {
  return boundsOf((function* () { for (const i of sel) if (work[i]) yield* work[i] })())
}

export function inRect(p: Point, r: Rect, margin: number): boolean {
  return p.x >= r.x - margin && p.x <= r.x + r.w + margin && p.y >= r.y - margin && p.y <= r.y + r.h + margin
}

/**
 * The annotations touched by moving (by a stored-coordinate delta) or deleting
 * the selected strokes, with their new stroke lists — empty means delete the
 * annotation. Untouched annotations are left out.
 */
export function applyToSelection(
  entries: InkEntry[], sel: Set<number>, op: { move: Point } | { remove: true },
): Array<{ entry: InkEntry; strokes: InkStroke[] }> {
  const out: Array<{ entry: InkEntry; strokes: InkStroke[] }> = []
  let base = 0
  for (const entry of entries) {
    const hit = entry.strokes.some((_, i) => sel.has(base + i))
    if (hit) {
      const strokes = 'move' in op
        ? entry.strokes.map((s, i) => sel.has(base + i)
          ? { ...s, points: s.points.map(p => ({ x: p.x + op.move.x, y: p.y + op.move.y })) }
          : s)
        : entry.strokes.filter((_, i) => !sel.has(base + i))
      out.push({ entry, strokes })
    }
    base += entry.strokes.length
  }
  return out
}
