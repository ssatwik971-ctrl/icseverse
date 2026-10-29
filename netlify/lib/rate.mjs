// Simple speed limit per user: at most RATE_MAX requests every RATE_WINDOW_MS.
// It is kept in the function's memory, so it stops quick bursts and loops (not a perfect global limit).
export const RATE_MAX = 60
export const RATE_WINDOW_MS = 60_000
const hits = new Map()
export function rateLimited(key, now = Date.now()) {
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) { hits.set(key, recent); return Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000) }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k)
  return 0
}
