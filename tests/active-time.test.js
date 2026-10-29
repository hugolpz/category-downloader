import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryDownloaderDB } from '../src/engine/db';
import { trackActiveTime } from '../src/engine/activeTime';
import { readProgress } from '../src/engine/stats';
import { mkJob } from './helpers';

let db;
const row = async () => db.counters.get('j');

beforeEach(async () => {
  // Fake only the clock and the interval: the (fake) database needs its own timers to work.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  db = new CategoryDownloaderDB(`t${Math.random()}`);
  await db.jobs.put(mkJob());
  await db.counters.put({ jobId: 'j', done: 0, failed: 0, lowWater: 0, recent: [] });
});
afterEach(() => vi.useRealTimers());

describe('trackActiveTime', () => {
  it('saves the running time every interval, and the rest on stop', async () => {
    const t = trackActiveTime(db, 'j', { intervalMs: 10_000 });
    await vi.advanceTimersByTimeAsync(25_000);
    expect((await row()).activeMs).toBe(20_000); // two flushes so far: a crash now would lose at most 10 s
    await t.stop();
    expect((await row()).activeMs).toBe(25_000);
  });

  it('adds up over several runs of the same download (pause, resume, reload)', async () => {
    const first = trackActiveTime(db, 'j');
    await vi.advanceTimersByTimeAsync(7_000);
    await first.stop();
    const second = trackActiveTime(db, 'j');
    await vi.advanceTimersByTimeAsync(3_000);
    await second.stop();
    expect((await row()).activeMs).toBe(10_000);
  });

  it('never overwrites what the downloader writes to the same row at the same time', async () => {
    const t = trackActiveTime(db, 'j');
    await vi.advanceTimersByTimeAsync(4_000);
    await Promise.all([
      t.flush(),
      db.counters
        .where(':id')
        .equals('j')
        .modify((c) => {
          c.done += 1;
          c.recent = ['LL-1.wav'];
        }),
    ]);
    expect(await row()).toMatchObject({ done: 1, recent: ['LL-1.wav'], activeMs: 4_000 });
    await t.stop();
  });

  it('stops its timer on stop()', async () => {
    const t = trackActiveTime(db, 'j');
    expect(vi.getTimerCount()).toBe(1);
    await t.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is harmless for a job without a counters row (nothing is created)', async () => {
    const t = trackActiveTime(db, 'ghost');
    await vi.advanceTimersByTimeAsync(5_000);
    await t.stop();
    expect(await db.counters.get('ghost')).toBeUndefined();
  });
});

describe('readProgress: saved timing', () => {
  it('returns the saved running time, 0 for downloads saved before it existed', async () => {
    await db.counters.update('j', { activeMs: 65_000 });
    expect((await readProgress(db, 'j')).activeMs).toBe(65_000);
    await db.counters.put({ jobId: 'old', done: 1, failed: 0, lowWater: 0, recent: [] });
    expect((await readProgress(db, 'old')).activeMs).toBe(0);
  });
});
