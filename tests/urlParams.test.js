import { describe, expect, it } from 'vitest';
import { buildQuery, DEFAULTS, parseParams } from '../src/utils/urlParams';

describe('urlParams', () => {
  it('round-trips', () => {
    const p = {
      category: 'Lingua Libre pronunciation-fra',
      subcats: ['Category:A b', 'Category:C'],
      delayMs: 500,
      concurrency: 4,
    };
    expect(parseParams(buildQuery(p))).toEqual(p);
  });
  it('omits defaults and clamps junk', () => {
    expect(buildQuery(DEFAULTS)).toBe('');
    expect(parseParams('?concurrency=99&delay=abc').concurrency).toBe(5);
    expect(parseParams('?delay=abc').delayMs).toBe(DEFAULTS.delayMs);
  });
});
