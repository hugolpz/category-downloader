import { describe, expect, it } from 'vitest';
import { buildQuery, buildQueryObject, DEFAULTS, parseParams } from '../src/utils/urlParams';

// The category is the path (/Category:Foo_bar); the query carries `cats` (what to download) and the other options.
describe('urlParams: options', () => {
  it('omits defaults and clamps junk', () => {
    expect(buildQuery(DEFAULTS)).toBe('');
    expect(parseParams('?concurrency=99&delay=abc').concurrency).toBe(5);
    expect(parseParams('?delay=abc').delayMs).toBe(DEFAULTS.delayMs);
  });
  it('reads a router query object as well as a query string', () => {
    expect(parseParams({ delay: '700', concurrency: '2' })).toMatchObject({ delayMs: 700, concurrency: 2 });
    expect(parseParams('?delay=700').delayMs).toBe(700);
  });
  it('never puts the category in the query, and never reads it from there', () => {
    expect(buildQueryObject({ ...DEFAULTS, category: 'Foo' })).toEqual({});
    expect(parseParams('?category=Foo')).not.toHaveProperty('category');
  });
});

describe('urlParams: ?cats= (which categories to download)', () => {
  it('no ?cats= means the default: just the top category (null), and null writes nothing', () => {
    expect(parseParams('').cats).toBeNull();
    expect(parseParams('?delay=500').cats).toBeNull();
    expect(buildQueryObject({ ...DEFAULTS, cats: null })).toEqual({});
  });

  it('reads the listed categories, whatever spelling, and removes duplicates', () => {
    expect(parseParams('?cats=Category:Foo_bar|Category:Foo_bar/Sub|category:Foo bar').cats).toEqual([
      'Category:Foo bar',
      'Category:Foo bar/Sub',
    ]);
    expect(parseParams({ cats: 'Foo_bar|Baz' }).cats).toEqual(['Category:Foo bar', 'Category:Baz']); // prefix added
  });

  it('writes the titles in the URL spelling (underscores), joined with |', () => {
    expect(buildQueryObject({ ...DEFAULTS, cats: ['Category:Foo bar', 'Category:Foo bar/Sub'] })).toEqual({
      cats: 'Category:Foo_bar|Category:Foo_bar/Sub',
    });
  });

  it('round-trips, with or without the top category in the list', () => {
    for (const cats of [['Category:Top', 'Category:A b'], ['Category:A b', 'Category:C'], ['Category:Top']]) {
      const p = { ...DEFAULTS, cats, delayMs: 500, concurrency: 4 };
      expect(parseParams(buildQuery(p))).toEqual({ cats, delayMs: 500, concurrency: 4 });
    }
  });

  it('an explicit empty selection is kept (?cats=), and differs from the default', () => {
    expect(buildQueryObject({ ...DEFAULTS, cats: [] })).toEqual({ cats: '' });
    expect(buildQuery({ ...DEFAULTS, cats: [] })).toBe('?cats=');
    expect(parseParams('?cats=').cats).toEqual([]);
    expect(parseParams('?cats=').cats).not.toBeNull();
  });

  it('the old ?subcats= is no longer read here (the router redirects such links)', () => {
    expect(parseParams('?subcats=A|B').cats).toBeNull();
  });
});
