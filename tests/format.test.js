import { describe, expect, it } from 'vitest';
import { formatDuration, formatRate } from '../src/utils/format';
import { averageSpeed } from '../src/utils/session';

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

describe('averageSpeed (files per second over the saved total running time)', () => {
  it('is 0 when there is no timing yet (an older download, or one that has not run)', () => {
    expect(averageSpeed(50, 0)).toBe(0);
    expect(averageSpeed(0, 0)).toBe(0);
    expect(averageSpeed(50, undefined)).toBe(0);
  });
  it('divides the files saved by the time the download actually ran', () => {
    expect(averageSpeed(50, 10_000)).toBe(5);
    expect(averageSpeed(1200, 600_000)).toBe(2);
    expect(averageSpeed(1, 4_000)).toBe(0.25);
  });
});
