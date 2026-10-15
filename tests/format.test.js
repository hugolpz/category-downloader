import { describe, expect, it } from 'vitest';
import { formatDuration, formatRate } from '../src/utils/format';
import { sessionSummary } from '../src/utils/session';

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(200)).toBe('< 1 s');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(12 * 60_000 + 5_000)).toBe('12 min 05 s');
    expect(formatDuration(2 * 3600_000 + 5 * 60_000)).toBe('2 h 05 min');
    expect(formatDuration(50 * 3600_000)).toBe('2 d 2 h');
  });
  it('formats rates', () => {
    expect(formatRate(0)).toBe('—');
    expect(formatRate(3.456)).toBe('3.5 files/s');
    expect(formatRate(42.4)).toBe('42 files/s');
  });
});

describe('sessionSummary', () => {
  it('is empty before any run', () => {
    expect(sessionSummary({ startedAt: 0, startDone: 0, endedAt: 0 }, 5, 1000)).toEqual({ elapsedMs: 0, perSecond: 0 });
  });
  it('averages over the running time', () => {
    expect(sessionSummary({ startedAt: 1000, startDone: 0, endedAt: 0 }, 50, 11_000)).toEqual({ elapsedMs: 10_000, perSecond: 5 });
  });
  it('freezes once ended, however late "now" is, and only counts this session\'s files', () => {
    const s = { startedAt: 0 + 1000, startDone: 100, endedAt: 21_000 };
    expect(sessionSummary(s, 300, 9_999_999)).toEqual({ elapsedMs: 20_000, perSecond: 10 });
  });
});
