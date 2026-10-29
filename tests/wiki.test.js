import { describe, expect, it } from 'vitest';
import { normalizeCategory } from '../src/api/commons';
import { fromApiTitle, parseCategory } from '../src/api/wiki';
import { categoryLabel } from '../src/utils/categoryPath';
import { folderName } from '../src/engine/paths';

describe('parseCategory', () => {
  it('defaults to Commons', () => {
    expect(parseCategory('Foo_bar')).toMatchObject({
      prefix: '',
      host: 'commons.wikimedia.org',
      name: 'Foo bar',
      title: 'Category:Foo bar',
    });
    expect(parseCategory('category:Foo').title).toBe('Category:Foo');
    expect(parseCategory('Category:Foo:bar').name).toBe('Foo:bar');
  });
  it('reads language + site', () => {
    expect(parseCategory('es:wp:Category:Guatemala')).toMatchObject({ prefix: 'es:wp', host: 'es.wikipedia.org', name: 'Guatemala' });
    expect(parseCategory('fr:wiktionary:Category:Foo').host).toBe('fr.wiktionary.org');
    expect(parseCategory('zh:wikisource:Foo')).toMatchObject({ prefix: 'zh:ws', host: 'zh.wikisource.org', name: 'Foo' });
  });
  it('reads site alone and language alone', () => {
    expect(parseCategory('c:Category:Foo')).toMatchObject({ prefix: '', host: 'commons.wikimedia.org' });
    expect(parseCategory('commons:Foo').name).toBe('Foo');
    expect(parseCategory('wikidata:Category:Foo')).toMatchObject({ prefix: 'wikidata', host: 'www.wikidata.org' });
    expect(parseCategory('metawiki:Category:Foo').host).toBe('meta.wikimedia.org');
    expect(parseCategory('mediawiki:Category:Foo').host).toBe('www.mediawiki.org');
    expect(parseCategory('wt:Category:Foo')).toMatchObject({ prefix: 'en:wt', host: 'en.wiktionary.org' });
    expect(parseCategory('de:Category:Foo')).toMatchObject({ prefix: 'de:wp', host: 'de.wikipedia.org' });
  });
  it('leaves other colons in the name alone', () => {
    expect(parseCategory('Foo: bar').name).toBe('Foo: bar');
    expect(parseCategory('abc:Foo').name).toBe('abc:Foo'); // a bare language needs "Category:" after it
    expect(parseCategory('').title).toBe('');
  });
});

describe('canonical names', () => {
  it('normalizeCategory keeps the wiki', () => {
    expect(normalizeCategory(' ES:wp:x ')).toBe('Category: ES:wp:x'.replace('Category: ', 'Category:')); // uppercase is not a prefix
    expect(normalizeCategory('es:wikipedia:Guate_mala')).toBe('es:wp:Category:Guate mala');
    expect(normalizeCategory('c:Foo')).toBe('Category:Foo');
    expect(normalizeCategory('es:wp:')).toBe('');
  });
  it('fromApiTitle canonicalises a localised namespace', () => {
    expect(fromApiTitle('fr:wp', 'Catégorie:Guatemala')).toBe('fr:wp:Category:Guatemala');
    expect(fromApiTitle('', 'Category:Foo')).toBe('Category:Foo');
  });
  it('labels and folders mention the wiki only when it is not Commons', () => {
    expect(categoryLabel('Category:Foo')).toBe('Foo');
    expect(categoryLabel('fr:wp:Category:Foo')).toBe('fr:wp:Foo');
    expect(folderName('Category:Foo')).toBe('Foo');
    expect(folderName('fr:wp:Category:Foo')).toBe('Foo (fr.wp)');
  });
});
