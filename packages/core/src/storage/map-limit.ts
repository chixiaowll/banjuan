/**
 * Map over `items` with at most `limit` calls in flight, keeping input order.
 * With async file reads, awaiting one at a time spends most of the wall time on
 * per-call latency; a small bounded fan-out reads in parallel without flooding
 * the thread pool (or the Capacitor bridge on mobile).
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
