import { normalizeCategory } from '../api/commons';
import { categoryParam } from './categoryPath';

/**
 * Form defaults. The category itself is not in the query string: it is the path (/Category:Foo_bar).
 *
 * `cats` is which categories to download:
 *   null      the default: just the category of the path (no `?cats=` in the URL)
 *   [titles]  exactly these. The top category's files are included ONLY if its own title is in the list;
 *             listing subcategories without it means "their files, but not the top category's"
 */
export const DEFAULTS = { category: '', cats: null, delayMs: 300, concurrency: 3 };

const clamp = (n, lo, hi, fallback) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

/**
 * Read the options carried by the query string (`?cats=Category:A|Category:B&delay=500&concurrency=2`) or by a router
 * query object. Titles may use underscores; they come back in the normal "Category:Foo bar" form.
 * @param {string | Record<string, string>} input
 */
export function parseParams(input) {
  const q = new URLSearchParams(input);
  return {
    // `?cats=` present (even empty) means an explicit selection; absent means the default
    cats: q.has('cats') ? [...new Set(q.get('cats').split('|').filter(Boolean).map(normalizeCategory))] : null,
    delayMs: clamp(Number(q.get('delay') ?? DEFAULTS.delayMs), 0, 5000, DEFAULTS.delayMs),
    concurrency: clamp(Number(q.get('concurrency') ?? DEFAULTS.concurrency), 1, 5, DEFAULTS.concurrency),
  };
}

/** The same options as a plain object (what the router wants). Only non-default values, so links stay short. */
export function buildQueryObject(p) {
  const q = {};
  if (p.cats) q.cats = p.cats.map(categoryParam).join('|'); // an empty selection stays visible: `?cats=`
  if (p.delayMs !== DEFAULTS.delayMs) q.delay = String(p.delayMs);
  if (p.concurrency !== DEFAULTS.concurrency) q.concurrency = String(p.concurrency);
  return q;
}

/** The options as a string for links: `?cats=…` or ''. */
export function buildQuery(p) {
  const s = new URLSearchParams(buildQueryObject(p)).toString();
  return s ? `?${s}` : '';
}
