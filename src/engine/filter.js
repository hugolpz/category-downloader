/**
 * The optional filter of a download. `mode` picks what is tested: 'none' | 'title' | 'date' | 'both'.
 * The form keeps all the fields; `normalizeFilter` reduces them to what the mode uses (or null = no filter).
 */
export const DEFAULT_FILTER = { mode: 'none', title: '', regex: false, from: '', to: '' };

/** The first error that would make the filter unusable (bad regex, inverted dates), else ''. */
export function filterError(f) {
  if (!f || f.mode === 'none') return '';
  const useTitle = f.mode === 'title' || f.mode === 'both';
  const useDate = f.mode === 'date' || f.mode === 'both';
  if (useTitle && f.regex && f.title) {
    try {
      new RegExp(f.title, 'i');
    } catch (e) {
      return `Invalid regular expression: ${e.message}`;
    }
  }
  if (useDate && f.from && f.to && f.from > f.to) return '“From” date is after “up to” date.';
  return '';
}

/** @returns {{title?: string, regex?: boolean, from?: string, to?: string} | null} what the job stores */
export function normalizeFilter(f) {
  if (!f || f.mode === 'none') return null;
  const out = {};
  if ((f.mode === 'title' || f.mode === 'both') && f.title) Object.assign(out, { title: f.title, regex: !!f.regex });
  if (f.mode === 'date' || f.mode === 'both') {
    if (f.from) out.from = f.from;
    if (f.to) out.to = f.to;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A predicate over imageinfo rows ({title, timestamp}). Title: substring (case-insensitive) or regex.
 * Dates are YYYY-MM-DD, both ends inclusive, compared to the UTC day of `timestamp`.
 */
export function makeMatcher(filter) {
  if (!filter) return () => true;
  const needle = filter.title?.toLowerCase();
  const re = filter.title && filter.regex ? new RegExp(filter.title, 'i') : null;
  return (row) => {
    if (filter.title) {
      const name = row.title.replace(/^File:/, '');
      if (re ? !re.test(name) : !name.toLowerCase().includes(needle)) return false;
    }
    if (filter.from || filter.to) {
      const day = (row.timestamp ?? '').slice(0, 10);
      if (!day || (filter.from && day < filter.from) || (filter.to && day > filter.to)) return false;
    }
    return true;
  };
}
