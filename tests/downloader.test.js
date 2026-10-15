import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommonsFlowDB } from '../src/engine/db';
import { retryFailed, runDownloads } from '../src/engine/downloader';
import { writeMetadataShard } from '../src/engine/metadata';
import { readProgress } from '../src/engine/stats';

import { body, memorySink, mkItem, mkJob, noSleep } from './helpers';

let db;
beforeEach(() => {
  db = new CommonsFlowDB(`t${Math.random()}`);
});
const seed = async (n, job = mkJob()) => {
  await db.jobs.put({ ...job, enumerated: n });
  await db.counters.put({ jobId: 'j', done: 0, failed: 0, lowWater: 0, recent: [] });
  await db.items.bulkAdd(Array.from({ length: n }, (_, i) => mkItem(i)));
};
const counters = async () => await db.counters.get('j');
const ok = (size = 10) => new Response(body(size), { status: 200 });
const asFetch = (f) => f;

describe('downloads', () => {
  it('downloads everything exactly once with concurrency, into sharded paths', async () => {
    await seed(12);
    const { sink, files } = memorySink();
    const calls = new Map();
    const fetchFn = asFetch(async (u) => (calls.set(u, (calls.get(u) ?? 0) + 1), ok()));
    await runDownloads(db, 'j', { sink, fetchFn, sleep: noSleep });
    const c = await counters();
    expect(c).toMatchObject({ done: 12, failed: 0, lowWater: 12 });
    expect(calls.size).toBe(12);
    expect([...calls.values()].every((n) => n === 1)).toBe(true);
    expect(files.has('files/0000/LL-0.wav')).toBe(true);
  });

  it('keeps a rolling log of the last 20 finished names', async () => {
    await seed(30, mkJob({ options: { sidecars: false, delayMs: 0, concurrency: 1 } }));
    const { sink } = memorySink();
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async () => ok()), sleep: noSleep });
    const c = await counters();
    expect(c.recent).toHaveLength(20);
    expect(c.recent[0]).toBe('LL-29.wav');
  });

  it('size mismatch commits nothing and is retried, then succeeds', async () => {
    await seed(1);
    const { sink, files } = memorySink();
    let n = 0;
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async () => ok(++n === 1 ? 6 : 10)), sleep: noSleep });
    expect(n).toBe(2);
    expect(files.get('files/0000/LL-0.wav').length).toBe(10);
    expect((await counters()).done).toBe(1);
  });

  it('persistent short read: failed (kept for retry), no file left behind', async () => {
    await seed(1);
    const { sink, files } = memorySink();
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async () => ok(3)), sleep: noSleep, random: () => 0 });
    const f = await db.failures.get(['j', 0]);
    expect(f).toMatchObject({ status: 'failed', attempts: 4, url: 'https://u/0' });
    expect(f.lastError).toMatch(/size mismatch/);
    expect(await counters()).toMatchObject({ done: 0, failed: 1 });
    expect(files.size).toBe(0);
  });

  it('404 fails immediately without retries; the job still completes the others', async () => {
    await seed(3);
    const { sink } = memorySink();
    let calls = 0;
    const fetchFn = asFetch(async (u) => (calls++, u.endsWith('/1') ? new Response('', { status: 404 }) : ok()));
    await runDownloads(db, 'j', { sink, fetchFn, sleep: noSleep });
    expect(calls).toBe(3);
    expect(await counters()).toMatchObject({ done: 2, failed: 1, lowWater: 3 });
  });

  it('429 honours Retry-After as a shared cool-down', async () => {
    await seed(1);
    const { sink } = memorySink();
    const waits = [];
    let n = 0;
    const fetchFn = asFetch(async () => (++n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '7' } }) : ok()));
    await runDownloads(db, 'j', { sink, fetchFn, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toContain(7000);
    expect((await counters()).done).toBe(1);
  });

  it('resume rescans from lowWater: unfinished items are redone, out-of-order finished ones are skipped', async () => {
    await seed(4);
    // Crash state: 0 done; 1 was in flight; 2 finished out of order; 3 untouched.
    await db.items.update(['j', 0], { status: 'done', url: '' });
    await db.items.update(['j', 2], { status: 'done', url: '' });
    await db.counters.put({ jobId: 'j', done: 2, failed: 0, lowWater: 1, recent: [] });
    const { sink } = memorySink();
    const urls = [];
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async (u) => (urls.push(u), ok())), sleep: noSleep });
    expect(urls.sort()).toEqual(['https://u/1', 'https://u/3']);
    expect(await counters()).toMatchObject({ done: 4, lowWater: 4 });
  });

  it('abort leaves the in-flight item pending and never counts it as failed', async () => {
    await seed(2);
    const { sink } = memorySink();
    const ac = new AbortController();
    const fetchFn = asFetch(
      (_u, init) =>
        new Promise((_r, rej) => {
          ac.abort();
          if (init?.signal?.aborted) rej(new DOMException('aborted', 'AbortError'));
        }),
    );
    await runDownloads(db, 'j', { sink, fetchFn, sleep: noSleep }, { signal: ac.signal });
    expect(await counters()).toMatchObject({ done: 0, failed: 0, lowWater: 0 });
    expect((await db.items.get(['j', 0])).status).toBe('pending');
  });

  it('lowWater never passes an unfinished item, even when later items finish first', async () => {
    await seed(4, mkJob({ options: { sidecars: false, delayMs: 0, concurrency: 2 } }));
    const { sink } = memorySink();
    const ac = new AbortController();
    // Item 0 hangs until aborted; items 1-3 finish. Abort once those are done.
    const fetchFn = asFetch((u, init) =>
      u.endsWith('/0')
        ? new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
        : Promise.resolve(ok()),
    );
    const run = runDownloads(db, 'j', { sink, fetchFn, sleep: noSleep }, { signal: ac.signal });
    for (let i = 0; i < 200 && (await counters()).done < 3; i++) await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    await run;
    expect(await counters()).toMatchObject({ done: 3, lowWater: 0 }); // 0 is still owed
    // resume finishes only item 0
    const urls = [];
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async (u) => (urls.push(u), ok())), sleep: noSleep });
    expect(urls).toEqual(['https://u/0']);
    expect(await counters()).toMatchObject({ done: 4, lowWater: 4 });
  });

  it('retryFailed requeues, rewinds lowWater, and a new run finishes them', async () => {
    await seed(3);
    const { sink } = memorySink();
    const fetchFn1 = asFetch(async (u) => (u.endsWith('/1') ? new Response('', { status: 404 }) : ok()));
    await runDownloads(db, 'j', { sink, fetchFn: fetchFn1, sleep: noSleep });
    expect(await counters()).toMatchObject({ done: 2, failed: 1, lowWater: 3 });
    expect(await retryFailed(db, 'j')).toBe(1);
    expect(await counters()).toMatchObject({ failed: 0, lowWater: 1 });
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async () => ok()), sleep: noSleep });
    expect(await counters()).toMatchObject({ done: 3, failed: 0, lowWater: 3 });
    expect(await db.failures.count()).toBe(0);
  });

  it('writes sidecars when enabled', async () => {
    await seed(1, mkJob({ options: { sidecars: true, delayMs: 0, concurrency: 1 } }));
    await db.items.update(['j', 0], { meta: { LicenseShortName: 'CC0', DateTime: '2026-01-01' } });
    const { sink, files } = memorySink();
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async () => ok()), sleep: noSleep });
    expect(JSON.parse(files.get('files/0000/LL-0.wav.json'))).toMatchObject({
      pageid: 100,
      descriptionurl: 'https://c/File:x',
      extmetadata: { LicenseShortName: 'CC0', DateTime: '2026-01-01' },
    });
  });
});

describe('slim done rows and progress snapshot', () => {
  it('drops bulky fields once done; progress comes from counters, not counting rows', async () => {
    await seed(3);
    await db.items.update(['j', 0], { meta: { License: 'x' } });
    const { sink } = memorySink();
    await runDownloads(db, 'j', { sink, fetchFn: asFetch(async () => ok()), sleep: noSleep });
    const row = await db.items.get(['j', 0]);
    expect(row).toMatchObject({ status: 'done', url: '', descriptionurl: '', sha1: '', size: 0, title: 'File:LL-0.wav' });
    expect(row.meta).toBeUndefined();
    const snap = await readProgress(db, 'j');
    expect(snap.counts).toEqual({ pending: 0, done: 3, failed: 0 });
    expect(snap.recent[0]).toMatch(/^LL-\d\.wav$/);
  });

  it('"next" lists pending rows from the low-water mark', async () => {
    await seed(5);
    await db.counters.put({ jobId: 'j', done: 2, failed: 0, lowWater: 2, recent: [] });
    await db.items.update(['j', 0], { status: 'done' });
    await db.items.update(['j', 1], { status: 'done' });
    const snap = await readProgress(db, 'j');
    expect(snap.upcoming).toEqual(['LL-2.wav', 'LL-3.wav', 'LL-4.wav']);
    expect(snap.counts.pending).toBe(3);
  });
});

describe('metadata shards', () => {
  it('writes one NDJSON line per row', async () => {
    const { sink, files } = memorySink();
    await writeMetadataShard(sink, 1, [mkItem(0), mkItem(1), mkItem(2)]);
    expect(files.get('metadata/page-000001.ndjson').trim().split('\n')).toHaveLength(3);
    await writeMetadataShard(sink, 2, []);
    expect(files.has('metadata/page-000002.ndjson')).toBe(false);
  });
});
