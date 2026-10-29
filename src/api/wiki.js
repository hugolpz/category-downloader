/**
 * Which wiki a category lives on, written as a prefix of its name:  [language:]site:Category:Name
 *
 *   fr:wp:Category:Guatemala   French Wikipedia          wp / wikipedia
 *   en:wt:…  ws:  wb:  wn:  wq:  wv:  wy:                 the other language-based projects (wiktionary, wikisource, …)
 *   c:Category:Foo, commons:…                             Wikimedia Commons (the default, written with no prefix)
 *   wikidata:  mediawiki:  metawiki:                      the single-language sites
 *
 * A lone language (`fr:Category:Foo`) means that language's Wikipedia; a lone language-based site (`wt:Category:Foo`)
 * means English. The canonical spelling (what the app stores and puts in addresses) is `prefix:Category:Name`, or
 * just `Category:Name` for Commons, so everything saved before wikis existed keeps its meaning.
 */

/** Language-based projects: alias → subdomain family. The canonical alias is the short one. */
const FAMILIES = {
  wp: 'wikipedia',
  wikipedia: 'wikipedia',
  wt: 'wiktionary',
  wiktionary: 'wiktionary',
  ws: 'wikisource',
  wikisource: 'wikisource',
  wb: 'wikibooks',
  wikibooks: 'wikibooks',
  wn: 'wikinews',
  wikinews: 'wikinews',
  wq: 'wikiquote',
  wikiquote: 'wikiquote',
  wv: 'wikiversity',
  wikiversity: 'wikiversity',
  wy: 'wikivoyage',
  wikivoyage: 'wikivoyage',
};
const CANONICAL_ALIAS = Object.fromEntries(
  Object.entries(FAMILIES)
    .filter(([alias]) => alias.length === 2)
    .map(([alias, f]) => [f, alias]),
);

/** Sites with one fixed host: alias → [canonical prefix ('' = the default), host]. */
const SINGLES = {
  c: ['', 'commons.wikimedia.org'],
  commons: ['', 'commons.wikimedia.org'],
  d: ['wikidata', 'www.wikidata.org'],
  wikidata: ['wikidata', 'www.wikidata.org'],
  mw: ['mediawiki', 'www.mediawiki.org'],
  mediawiki: ['mediawiki', 'www.mediawiki.org'],
  m: ['metawiki', 'meta.wikimedia.org'],
  meta: ['metawiki', 'meta.wikimedia.org'],
  metawiki: ['metawiki', 'meta.wikimedia.org'],
};

export const COMMONS_HOST = 'commons.wikimedia.org';
const LANG = /^[a-z]{2,3}(-[a-z]+)*$/;
const WORD = /^[a-z][a-z-]*$/;

const family = (lang, site) => ({ prefix: `${lang}:${CANONICAL_ALIAS[FAMILIES[site]]}`, host: `${lang}.${FAMILIES[site]}.org` });

/** A leading list of 1 or 2 words → a wiki, or null. `lone` marks a bare language, which only counts before "Category:". */
function resolve(words) {
  if (words.length === 1) {
    const [w] = words;
    if (SINGLES[w]) return { prefix: SINGLES[w][0], host: SINGLES[w][1] };
    if (FAMILIES[w]) return family('en', w);
    return LANG.test(w) ? { ...family(w, 'wp'), lone: true } : null;
  }
  const [lang, site] = words;
  return LANG.test(lang) && !SINGLES[lang] && FAMILIES[site] ? family(lang, site) : null;
}

/**
 * Read what was typed (or stored): optional wiki prefix, optional "Category:", then the name.
 * @param {string} input e.g. "Foo_bar", "Category:Foo", "es:wp:Category:Guatemala", "c:Foo"
 * @returns {{ prefix: string, host: string, name: string, title: string }}
 *   `prefix` is '' for Commons; `name` has spaces (not underscores) and no "Category:"; `title` is "Category:Name" ('' if no name)
 */
export function parseCategory(input) {
  const segs = String(input ?? '')
    .trim()
    .replace(/_/g, ' ')
    .split(':');
  let lead = 0;
  while (lead < 2 && lead < segs.length - 1 && WORD.test(segs[lead].trim())) lead++;
  let wiki = { prefix: '', host: COMMONS_HOST };
  let used = 0;
  for (let k = lead; k >= 1; k--) {
    const w = resolve(segs.slice(0, k).map((s) => s.trim()));
    const beforeCategory = /^category$/i.test(segs[k].trim());
    if (w && (!w.lone || beforeCategory)) {
      wiki = { prefix: w.prefix, host: w.host };
      used = k;
      break;
    }
  }
  const name = segs
    .slice(used)
    .join(':')
    .replace(/^\s*category:/i, '')
    .trim();
  return { ...wiki, name, title: name ? `Category:${name}` : '' };
}

/** Put a wiki prefix back in front of a title ("Category:Foo"). */
export const withPrefix = (prefix, title) => (prefix ? `${prefix}:${title}` : title);

/**
 * A category title as the API returns it ("Catégorie:Foo" on French wikis) in our canonical spelling
 * ("fr:wp:Category:Foo"), so the same category always has the same name whatever the wiki's language.
 */
export const fromApiTitle = (prefix, apiTitle) => withPrefix(prefix, `Category:${apiTitle.slice(apiTitle.indexOf(':') + 1)}`);

/** The wiki host of a stored category, e.g. "fr.wikipedia.org". */
export const wikiHost = (category) => parseCategory(category).host;
