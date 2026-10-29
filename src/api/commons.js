// Same-origin relay on our server (server/index.mjs): Commons does not send CORS headers for our origins.
const API = '/api/w';

export class AuthExpiredError extends Error {}

/**
 * Single place that talks to the Action API, through our relay: Bearer auth is forwarded server-side.
 * @param {Record<string, string>} params
 * @param {string} token
 * @param {{ signal?: AbortSignal }} [options] lets a caller cancel a request that is no longer wanted
 */
export async function apiGet(params, token, { signal } = {}) {
  const url = new URL(API, location.origin);
  url.search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
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

/** "Category:Foo" from "Foo", " Category:Foo ", "Category:Foo_bar" … */
export function normalizeCategory(input) {
  const t = input
    .trim()
    .replace(/_/g, ' ')
    .replace(/^category:/i, '');
  return t ? `Category:${t}` : '';
}

/** File and subcategory counts for up to `limit` category titles (50, or 500 with bot speed). */
export async function categoryInfo(titles, token, limit = 50) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += limit) {
    const json = await apiGet({ action: 'query', prop: 'categoryinfo', titles: titles.slice(i, i + limit).join('|') }, token);
    for (const p of json.query?.pages ?? []) {
      out.set(p.title, { exists: !p.missing, files: p.categoryinfo?.files ?? 0, subcats: p.categoryinfo?.subcats ?? 0 });
    }
  }
  return out;
}

/** Level-1 subcategories with their file counts. */
export async function listSubcategories(category, token, botSpeed = false) {
  const titles = [];
  let cont;
  do {
    const json = await apiGet(
      {
        action: 'query',
        list: 'categorymembers',
        cmtitle: category,
        cmtype: 'subcat',
        cmlimit: botSpeed ? '5000' : '500',
        ...(cont ? { cmcontinue: cont } : {}),
      },
      token,
    );
    titles.push(...json.query.categorymembers.map((m) => m.title));
    cont = json.continue?.cmcontinue;
  } while (cont);
  const info = await categoryInfo(titles, token, botSpeed ? 500 : 50);
  return titles.map((title) => ({ title, files: info.get(title)?.files ?? 0, subcats: info.get(title)?.subcats ?? 0 }));
}
