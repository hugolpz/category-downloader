// Same-origin relay on our server (server/index.mjs): Commons does not send CORS headers for our origins.
import { fromApiTitle, parseCategory, withPrefix } from './wiki';

const API = '/api/w';

export class AuthExpiredError extends Error {}

/**
 * Single place that talks to the Action API, through our relay: Bearer auth is forwarded server-side.
 * @param {Record<string, string>} params
 * @param {string} token
 * @param {{ signal?: AbortSignal, wiki?: string }} [options] `signal` lets a caller cancel a request that is no longer wanted;
 *   `wiki` is the host to ask (default Commons), e.g. "fr.wikipedia.org". The relay only accepts Wikimedia hosts.
 */
export async function apiGet(params, token, { signal, wiki } = {}) {
  const url = new URL(API, location.origin);
  url.search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    ...(wiki ? { wiki } : {}),
    ...params,
  }).toString();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'CategoryDownloader' },
    signal,
  });
  if (res.status === 401) throw new AuthExpiredError('Access token expired');
  if (res.status === 429) throw new Error(`Rate limited (retry after ${res.headers.get('Retry-After') ?? '?'}s)`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (json.error?.code === 'mwoauth-invalid-authorization') throw new AuthExpiredError(json.error.info);
  return json;
}

export async function fetchUserInfo(token) {
  const json = await apiGet({ action: 'query', meta: 'userinfo', uiprop: 'rights|groups' }, token);
  return json.query.userinfo;
}

/** Bot speed is read from the API, not user-set: `apihighlimits` right present => high limits. */
export const hasBotSpeed = (u) => u.rights.includes('apihighlimits');

/**
 * "Category:Foo" from "Foo", " Category:Foo ", "Category:Foo_bar" …; with a wiki prefix when not Commons:
 * "es:wp:Category:Guatemala" (see wiki.js).
 */
export function normalizeCategory(input) {
  const { prefix, title } = parseCategory(input);
  return title && withPrefix(prefix, title);
}

/**
 * File and subcategory counts for up to `limit` category titles (50, or 500 with bot speed). All titles are on the same
 * wiki (the one of the first); keys of the result are the titles as given, prefix included.
 */
export async function categoryInfo(titles, token, limit = 50) {
  const out = new Map();
  const { prefix, host } = parseCategory(titles[0]);
  for (let i = 0; i < titles.length; i += limit) {
    const plain = titles.slice(i, i + limit).map((t) => parseCategory(t).title);
    const json = await apiGet({ action: 'query', prop: 'categoryinfo', titles: plain.join('|') }, token, { wiki: host });
    for (const p of json.query?.pages ?? []) {
      out.set(fromApiTitle(prefix, p.title), {
        exists: !p.missing,
        files: p.categoryinfo?.files ?? 0,
        subcats: p.categoryinfo?.subcats ?? 0,
      });
    }
  }
  return out;
}

/** Level-1 subcategories with their file counts. */
export async function listSubcategories(category, token, botSpeed = false) {
  const { prefix, host, title: plainCategory } = parseCategory(category);
  const titles = [];
  let cont;
  do {
    const json = await apiGet(
      {
        action: 'query',
        list: 'categorymembers',
        cmtitle: plainCategory,
        cmtype: 'subcat',
        cmlimit: botSpeed ? '5000' : '500',
        ...(cont ? { cmcontinue: cont } : {}),
      },
      token,
      { wiki: host },
    );
    titles.push(...json.query.categorymembers.map((m) => fromApiTitle(prefix, m.title)));
    cont = json.continue?.cmcontinue;
  } while (cont);
  const info = await categoryInfo(titles, token, botSpeed ? 500 : 50);
  return titles.map((title) => ({ title, files: info.get(title)?.files ?? 0, subcats: info.get(title)?.subcats ?? 0 }));
}
