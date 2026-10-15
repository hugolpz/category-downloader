import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { db } from '../src/engine/db';
import { useJobStore } from '../src/stores/job';
import { mkJob } from './helpers';

let n = 0;
let clock = Date.now();
/** A job for its own unique category (the database is shared by every test in this file). */
const seedJob = async (over = {}, counters = {}) => {
  const id = String(clock++);
  const category = over.categories?.[0] ?? `Category:Test ${n++}`;
  const job = mkJob({ id, folder: 'My category', ...over, categories: [category, ...(over.categories?.slice(1) ?? [])] });
  await db.jobs.put(job);
  await db.counters.put({ jobId: id, done: 0, failed: 0, lowWater: 0, recent: [], ...counters });
  return job;
};

beforeEach(() => setActivePinia(createPinia()));

describe('job.attachCategory (opening /Category:…)', () => {
  it("says 'missing' for a category that was never downloaded in this browser", async () => {
    const job = useJobStore();
    expect(await job.attachCategory('Category:Never_downloaded')).toBe('missing');
    expect(job.jobId).toBeNull();
  });

  it('restores a finished download as done, with nothing to resume', async () => {
    const j = await seedJob({ enumDone: true, enumerated: 3 }, { done: 3 });
    const job = useJobStore();
    expect(await job.attachCategory(j.categories[0])).toBe('ok');
    expect(job.jobId).toBe(j.id);
    expect(job.category).toBe(j.categories[0]);
    expect(job.phase).toBe('done');
    expect(job.unfinished).toBeNull();
    expect(job.folder).toBe('My category');
  });

  it('matches whatever spelling the URL uses: underscores, lowercase prefix, no prefix', async () => {
    const j = await seedJob({ categories: ['Category:Lingua Libre pronunciation-sru'], enumDone: true, enumerated: 1 }, { done: 1 });
    for (const spelling of [
      'Category:Lingua_Libre_pronunciation-sru',
      'category:Lingua_Libre_pronunciation-sru',
      'Lingua_Libre_pronunciation-sru',
    ]) {
      setActivePinia(createPinia());
      const job = useJobStore();
      expect(await job.attachCategory(spelling)).toBe('ok');
      expect(job.jobId).toBe(j.id);
    }
  });

  it('restores an unfinished download as paused, with the Resume offer', async () => {
    const j = await seedJob({ enumDone: true, enumerated: 5 }, { done: 2 });
    const job = useJobStore();
    expect(await job.attachCategory(j.categories[0])).toBe('ok');
    expect(job.phase).toBe('stopped');
    expect(job.unfinished?.id).toBe(j.id);
  });

  it('opens the LATEST job when a category was downloaded more than once', async () => {
    const category = 'Category:Downloaded twice';
    await seedJob({ categories: [category], enumDone: true, enumerated: 1 }, { done: 1 });
    const newer = await seedJob({ categories: [category], enumDone: true, enumerated: 4 }, { done: 1 });
    const job = useJobStore();
    await job.attachCategory(category);
    expect(job.jobId).toBe(newer.id);
    expect(job.phase).toBe('stopped');
  });

  it('only the ROOT category counts: a subcategory is not a separate download', async () => {
    const j = await seedJob({ categories: ['Category:Root one', 'Category:Child one'], enumDone: true, enumerated: 1 }, { done: 1 });
    const job = useJobStore();
    expect(await job.attachCategory('Category:Child one')).toBe('missing');
    expect(await job.attachCategory(j.categories[0])).toBe('ok');
  });

  it('treats a download whose listing is not finished as unfinished even with every listed file done', async () => {
    const j = await seedJob({ enumDone: false, enumerated: 3 }, { done: 3 });
    const job = useJobStore();
    await job.attachCategory(j.categories[0]);
    expect(job.phase).toBe('stopped');
  });

  it('does nothing when that category is already the open one', async () => {
    const j = await seedJob({ enumDone: true, enumerated: 1 }, { done: 1 });
    const job = useJobStore();
    await job.attachCategory(j.categories[0]);
    job.phase = 'running';
    expect(await job.attachCategory(j.categories[0])).toBe('ok');
    expect(job.phase).toBe('running'); // untouched
  });

  it("refuses to open a different category while a download is running ('busy')", async () => {
    const a = await seedJob({ enumDone: true, enumerated: 1 }, { done: 1 });
    const b = await seedJob({ enumDone: true, enumerated: 1 }, { done: 1 });
    const job = useJobStore();
    await job.attachCategory(a.categories[0]);
    job.phase = 'running';
    expect(await job.attachCategory(b.categories[0])).toBe('busy');
    expect(job.jobId).toBe(a.id);
  });

  it('checkUnfinished follows the open job, not the latest unfinished one', async () => {
    const finished = await seedJob({ enumDone: true, enumerated: 2 }, { done: 2 });
    await seedJob({ enumDone: true, enumerated: 9 }, { done: 1 }); // a newer job with work left
    const job = useJobStore();
    await job.attachCategory(finished.categories[0]);
    await job.checkUnfinished();
    expect(job.unfinished).toBeNull(); // Resume here must never resume a different download
  });

  it('with nothing open, checkUnfinished offers the latest job with work', async () => {
    await seedJob({ enumDone: true, enumerated: 9 }, { done: 1 });
    const job = useJobStore();
    await job.checkUnfinished();
    expect(job.unfinished).not.toBeNull();
  });

  it('a download without the top category lives at the TOP category page, not at its first subcategory', async () => {
    const id = String(clock++);
    await db.jobs.put(
      mkJob({ id, root: 'Category:Root two', categories: ['Category:Root two/A', 'Category:Root two/B'], enumDone: true, enumerated: 2 }),
    );
    await db.counters.put({ jobId: id, done: 2, failed: 0, lowWater: 2, recent: [] });
    const job = useJobStore();
    expect(await job.attachCategory('Category:Root_two/A')).toBe('missing'); // a subcategory is not a page of its own
    expect(await job.attachCategory('Category:Root_two')).toBe('ok');
    expect(job.jobId).toBe(id);
    expect(job.category).toBe('Category:Root two');
  });

  it('older jobs (no root field) are found by their first category', async () => {
    const j = await seedJob({ enumDone: true, enumerated: 1 }, { done: 1 }); // seedJob sets no root
    expect(j.root).toBeUndefined();
    const job = useJobStore();
    expect(await job.attachCategory(j.categories[0])).toBe('ok');
  });
});
