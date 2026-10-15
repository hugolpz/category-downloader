import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { db } from '../src/engine/db';
import { readProgress } from '../src/engine/stats';
import { useJobStore } from '../src/stores/job';
import { averageSpeed } from '../src/utils/session';
import { downloadStepState } from '../src/views/workspaceState';
import { mkItem, mkJob } from './helpers';

// "Watch it download" is per category: change the category in the field and step 3 shows THAT category's last
// saved stats (cards, "Just saved", "Up next"), or its resting state when nothing was downloaded for it.

let clock = Date.now();
const download = async (category, { done, total, recent, activeMs, enumDone = true }) => {
  const id = String(clock++);
  await db.jobs.put(
    mkJob({ id, root: category, categories: [category], enumDone, enumerated: total, folder: category.replace('Category:', '') }),
  );
  await db.counters.put({ jobId: id, done, failed: 0, lowWater: done, recent, activeMs });
  // the queue: `total - done` files still waiting
  await db.items.bulkAdd(
    Array.from({ length: total - done }, (_, i) => mkItem(done + i, { jobId: id, title: `File:${category}-next-${i}.wav` })),
  );
  return id;
};

let job;
beforeEach(() => {
  setActivePinia(createPinia());
  job = useJobStore();
});

/** What step 3 would show if the field says `field`, after the page looked it up. */
const step3 = async (field) => {
  const attached = await job.attachCategory(field);
  return downloadStepState({ attached, ready: true, openJobId: job.jobId, openCategory: job.category, category: field, running: false });
};

describe('step 3 follows the category in the field', () => {
  it("loads each category's own last stats, and they do not mix", async () => {
    const a = await download('Category:Stats A', { done: 120, total: 120, recent: ['A-last.wav', 'A-before.wav'], activeMs: 60_000 });
    const b = await download('Category:Stats B', { done: 3, total: 10, recent: ['B-last.wav'], activeMs: 9_000 });

    expect(await step3('Category:Stats A')).toBe('ok');
    expect(job.jobId).toBe(a);
    const statsA = await readProgress(db, job.jobId);
    expect(statsA.counts).toEqual({ pending: 0, done: 120, failed: 0 });
    expect(statsA.recent).toEqual(['A-last.wav', 'A-before.wav']); // "Just saved"
    expect(averageSpeed(statsA.counts.done, statsA.activeMs)).toBe(2); // 120 files in 60 s: the card values survive a reload

    // the user types/picks another category: step 3 switches to its saved stats
    expect(await step3('Category:Stats B')).toBe('ok');
    expect(job.jobId).toBe(b);
    const statsB = await readProgress(db, job.jobId);
    expect(statsB.counts).toEqual({ pending: 7, done: 3, failed: 0 });
    expect(statsB.recent).toEqual(['B-last.wav']);
    expect(statsB.upcoming).toHaveLength(7); // "Up next"
    expect(statsB.upcoming[0]).toContain('Stats B-next-0');
    expect(averageSpeed(statsB.counts.done, statsB.activeMs)).toBeCloseTo(0.333, 3);

    // and back: the first category's stats are exactly as it left them
    expect(await step3('Category:Stats A')).toBe('ok');
    expect((await readProgress(db, job.jobId)).recent).toEqual(['A-last.wav', 'A-before.wav']);
  });

  it('shows the resting state for a category that was never downloaded, even while another one is open', async () => {
    await download('Category:Stats C', { done: 5, total: 5, recent: ['C.wav'], activeMs: 5_000 });
    expect(await step3('Category:Stats C')).toBe('ok');
    expect(await step3('Category:Never downloaded')).toBe('none'); // resting state: the placeholder
    expect(await step3('Category:Stats C')).toBe('ok');
  });

  it('a half-typed name is just the resting state', async () => {
    await download('Category:Stats Lingua Libre', { done: 2, total: 2, recent: ['x.wav'], activeMs: 1_000 });
    expect(await step3('Category:Stats Lingu')).toBe('none');
    expect(await step3('Category:Stats Lingua Libre')).toBe('ok');
  });

  it('spelling does not matter: the URL form (underscores) finds the same saved stats', async () => {
    const id = await download('Category:Stats Spelling Check', { done: 4, total: 4, recent: ['s.wav'], activeMs: 2_000 });
    expect(await step3('Category:Stats_Spelling_Check')).toBe('ok');
    expect(job.jobId).toBe(id);
  });

  it('an older download without saved timing still loads, with no average speed or time to show', async () => {
    await download('Category:Stats Old', { done: 9, total: 9, recent: ['o.wav'], activeMs: undefined });
    expect(await step3('Category:Stats Old')).toBe('ok');
    const stats = await readProgress(db, job.jobId);
    expect(stats.activeMs).toBe(0);
    expect(averageSpeed(stats.counts.done, stats.activeMs)).toBe(0); // the card shows "—"
  });
});
