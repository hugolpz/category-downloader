import { describe, expect, it } from 'vitest';
import { buildQuery, buildQueryObject, DEFAULTS, parseParams } from '../src/utils/urlParams';

// The category is the path (/Category:Foo_bar); the query only carries the other options.
describe('urlParams', () => {
  it('round-trips the options', () => {
    const p = { subcats: ['Category:A b', 'Category:C'], delayMs: 500, concurrency: 4 };
    expect(parseParams(buildQuery(p))).toEqual(p);
  });
  it('omits defaults and clamps junk', () => {
    expect(buildQuery(DEFAULTS)).toBe('');
    expect(parseParams('?concurrency=99&delay=abc').concurrency).toBe(5);
    expect(parseParams('?delay=abc').delayMs).toBe(DEFAULTS.delayMs);
  });
  it('reads a router query object as well as a query string', () => {
    const p = { subcats: ['Category:A', 'Category:B'], delayMs: 500, concurrency: 4 };
    expect(parseParams(buildQueryObject(p))).toEqual(p);
    expect(parseParams({ delay: '700' }).delayMs).toBe(700);
  });
  it('builds a query object with only non-default options', () => {
    expect(buildQueryObject(DEFAULTS)).toEqual({});
    expect(buildQueryObject({ ...DEFAULTS, subcats: ['A', 'B'], delayMs: 100 })).toEqual({ subcats: 'A|B', delay: '100' });
  });
  it('never puts the category in the query, and never reads it from there', () => {
    expect(buildQueryObject({ ...DEFAULTS, category: 'Foo' })).toEqual({});
    expect(buildQuery({ ...DEFAULTS, category: 'Foo' })).toBe('');
    expect(parseParams('?category=Foo')).not.toHaveProperty('category');
  });
});
