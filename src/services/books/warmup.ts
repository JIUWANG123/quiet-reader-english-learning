let active: { bookId: string; source: string } | null = null;
const listeners = new Set<() => void>();
export function startEpubWarmup(bookId: string, source: string) { active = { bookId, source }; listeners.forEach((fn) => fn()); }
export function currentEpubWarmup() { return active; }
export function finishEpubWarmup(bookId: string) { if (active?.bookId === bookId) { active = null; listeners.forEach((fn) => fn()); } }
export function subscribeEpubWarmup(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
