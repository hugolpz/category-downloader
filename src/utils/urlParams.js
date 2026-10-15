export const DEFAULTS = { category: '', subcats: [], delayMs: 300, concurrency: 3 };

const clamp = (n, lo, hi, fallback) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

export function parseParams(search) {
  const q = new URLSearchParams(search);
  return {
    category: q.get('category') ?? DEFAULTS.category,
    subcats: q.get('subcats')?.split('|').filter(Boolean) ?? [],
    delayMs: clamp(Number(q.get('delay') ?? DEFAULTS.delayMs), 0, 5000, DEFAULTS.delayMs),
    concurrency: clamp(Number(q.get('concurrency') ?? DEFAULTS.concurrency), 1, 5, DEFAULTS.concurrency),
  };
}

/** Only non-default values are emitted so share links stay short. */
export function buildQuery(p) {
  const q = new URLSearchParams();
  if (p.category) q.set('category', p.category);
  if (p.subcats.length) q.set('subcats', p.subcats.join('|'));
  if (p.delayMs !== DEFAULTS.delayMs) q.set('delay', String(p.delayMs));
  if (p.concurrency !== DEFAULTS.concurrency) q.set('concurrency', String(p.concurrency));
  const s = q.toString();
  return s ? `?${s}` : '';
}
