let active: { bookId: string; source: string } | null = null;
const listeners = new Set<() => void>();
export function startEpubWarmup(bookId: string, source: string) { active = { bookId, source }; listeners.forEach((fn) => fn()); }
export function currentEpubWarmup() { return active; }
export function finishEpubWarmup(bookId: string) { if (active?.bookId === bookId) { active = null; listeners.forEach((fn) => fn()); } }
/** Opening a book ends warmup. The warmup is a second hidden WebView running its
 * own epub.js instance, and it competes with the reader for the same Chromium
 * renderer process, which is what kills the reader under memory pressure. A
 * warmup that outlives the moment the user starts reading is pure cost. */
export function cancelEpubWarmup() { if (active) { active = null; listeners.forEach((fn) => fn()); } }
export function subscribeEpubWarmup(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
