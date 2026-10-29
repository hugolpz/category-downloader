import { describe, expect, it } from 'vitest';
import { filterError, makeMatcher, normalizeFilter, parseDay } from '../src/engine/filter';

const row = (title, timestamp) => ({ title, timestamp });

describe('filter', () => {
  it('matches everything without a filter', () => {
    expect(makeMatcher(null)(row('File:A.jpg', '2020-01-01T00:00:00Z'))).toBe(true);
  });
  it('matches a title substring, ignoring case and the File: prefix', () => {
    const m = makeMatcher({ title: 'eiffel' });
    expect(m(row('File:The Eiffel tower.jpg'))).toBe(true);
    expect(m(row('File:Louvre.jpg'))).toBe(false);
    expect(makeMatcher({ title: 'file' })(row('File:Louvre.jpg'))).toBe(false);
  });
  it('matches a regex title', () => {
    const m = makeMatcher({ title: '^Paris.*\\.jpe?g$', regex: true });
    expect(m(row('File:Paris night.jpeg'))).toBe(true);
    expect(m(row('File:Paris night.png'))).toBe(false);
  });
  it('bounds the upload day, both ends inclusive', () => {
    const m = makeMatcher({ from: '2020-01-02', to: '2020-01-03' });
    expect(m(row('File:A', '2020-01-01T23:59:59Z'))).toBe(false);
    expect(m(row('File:A', '2020-01-02T00:00:00Z'))).toBe(true);
    expect(m(row('File:A', '2020-01-03T23:59:59Z'))).toBe(true);
    expect(m(row('File:A', '2020-01-04T00:00:00Z'))).toBe(false);
  });
  it('reports bad regexes and inverted dates, and drops unused fields', () => {
    expect(filterError({ mode: 'title', title: '(', regex: true })).toMatch(/Invalid regular expression/);
    expect(filterError({ mode: 'date', from: '2021-01-01', to: '2020-01-01' })).not.toBe('');
    expect(filterError({ mode: 'date', title: '(', regex: true })).toBe('');
    expect(normalizeFilter({ mode: 'date', title: 'x', from: '2020-01-01', to: '' })).toEqual({ from: '2020-01-01' });
    expect(normalizeFilter({ mode: 'title', title: '' })).toBeNull();
  });
});

describe('parseDay', () => {
  it('reads typed days in any of YYYY/MM/DD, YYYY-MM-DD, YYYY.M.D', () => {
    expect(parseDay('2024/03/05')).toBe('2024-03-05');
    expect(parseDay(' 2024-3-5 ')).toBe('2024-03-05');
    expect(parseDay('2024.12.31')).toBe('2024-12-31');
  });
  it('refuses what is not a real day', () => {
    for (const bad of ['', '2024/02/30', '2024/13/01', '03/05/2024', '2024/03', 'abc']) expect(parseDay(bad)).toBeNull();
  });
});
