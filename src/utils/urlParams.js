/** Form defaults. The category itself is not in the query string: it is the path (/Category:Foo_bar). */
export const DEFAULTS = { category: '', subcats: [], delayMs: 300, concurrency: 3 };

const clamp = (n, lo, hi, fallback) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

/**
 * Read the options carried by the query string (`?subcats=A|B&delay=500&concurrency=2`) or by a router query object.
 * @param {string | Record<string, string>} input
 */
export function parseParams(input) {
  const q = new URLSearchParams(input);
  return {
    subcats: q.get('subcats')?.split('|').filter(Boolean) ?? [],
    delayMs: clamp(Number(q.get('delay') ?? DEFAULTS.delayMs), 0, 5000, DEFAULTS.delayMs),
    concurrency: clamp(Number(q.get('concurrency') ?? DEFAULTS.concurrency), 1, 5, DEFAULTS.concurrency),
  };
}

/** The same options as a plain object (what the router wants). Only non-default values, so links stay short. */
export function buildQueryObject(p) {
  const q = {};
  if (p.subcats.length) q.subcats = p.subcats.join('|');
  if (p.delayMs !== DEFAULTS.delayMs) q.delay = String(p.delayMs);
  if (p.concurrency !== DEFAULTS.concurrency) q.concurrency = String(p.concurrency);
  return q;
}

/** The options as a string for links: `?subcats=…` or ''. */
export function buildQuery(p) {
  const s = new URLSearchParams(buildQueryObject(p)).toString();
  return s ? `?${s}` : '';
}
