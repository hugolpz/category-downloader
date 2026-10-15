import { apiGet } from './commons';
import { categoryParam } from '../utils/categoryPath';

/** Suggestions start once this many characters of the name (without "Category:") are typed. */
export const MIN_SEARCH_LENGTH = 5;

/** The part of what was typed that is searched: no "Category:" prefix, underscores as spaces, trimmed. */
export const searchTerm = (typed) =>
  String(typed ?? '')
    .replace(/_/g, ' ')
    .replace(/^\s*category:/i, '')
    .trim();

/**
 * Real Commons categories whose name starts like what was typed (case-insensitive), best match first, each with
 * its file and subcategory counts. One API call: prefix search in the Category namespace (14) with `categoryinfo`.
 *
 * @param {string} typed
 * @param {string} token
 * @param {{ signal?: AbortSignal, limit?: number }} [options]
 * @returns {Promise<{ title: string, files: number, subcats: number }[]>} [] when too short or nothing matches
 */
export async function suggestCategories(typed, token, { signal, limit = 8 } = {}) {
  const term = searchTerm(typed);
  if (term.length < MIN_SEARCH_LENGTH) return [];
  const json = await apiGet(
    { action: 'query', generator: 'prefixsearch', gpssearch: term, gpsnamespace: '14', gpslimit: String(limit), prop: 'categoryinfo' },
    token,
    { signal },
  );
  // No match: the response has no `query` at all. `pages` is not in relevance order; `index` is.
  return (json.query?.pages ?? [])
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ title: p.title, files: p.categoryinfo?.files ?? 0, subcats: p.categoryinfo?.subcats ?? 0 }));
}

const plural = (n, one, many) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** A suggestion as a Codex menu item: the value is what goes into the field (the Commons URL spelling). */
export function toMenuItem({ title, files, subcats }) {
  const value = categoryParam(title);
  return {
    value,
    label: value,
    description: files || !subcats ? plural(files, 'file', 'files') : `no files, ${plural(subcats, 'subcategory', 'subcategories')}`,
  };
}
