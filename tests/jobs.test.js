import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../src/engine/db';
import { createJob, findUnfinishedJob } from '../src/engine/jobs';
import { jobRoot } from '../src/utils/categoryPath';

const form = { delayMs: 300, concurrency: 3 };

describe('createJob', () => {
  it('records the top category and exactly the categories to download (top included)', async () => {
    const job = await createJob('Category:Foo bar', ['Category:Foo bar', 'Category:Foo bar/A'], form, null, 12, false);
    expect(job).toMatchObject({
      root: 'Category:Foo bar',
      categories: ['Category:Foo bar', 'Category:Foo bar/A'],
      folder: 'Foo bar',
      approxTotal: 12,
    });
    expect((await db.jobs.get(job.id)).root).toBe('Category:Foo bar');
    expect((await db.counters.get(job.id)).done).toBe(0);
  });

  it('the top category can be left out: the job lists only the others but still belongs to the top category', async () => {
    const job = await createJob('Category:Foo bar', ['Category:Foo bar/A', 'Category:Foo bar/B'], form, null, 9, false);
    expect(job.categories).toEqual(['Category:Foo bar/A', 'Category:Foo bar/B']);
    expect(job.root).toBe('Category:Foo bar');
    expect(job.folder).toBe('Foo bar'); // named after the top category, not the first subcategory
    expect(jobRoot(job)).toBe('Category:Foo bar');
    expect(job.cursors).toEqual({}); // nothing listed yet
  });

  it('such a job still shows up as unfinished (resume works)', async () => {
    const job = await createJob('Category:Resume me', ['Category:Resume me/A'], form, null, 3, false);
    const found = await findUnfinishedJob();
    expect(found.id).toBe(job.id);
    expect(jobRoot(found)).toBe('Category:Resume me');
  });
});

describe('jobRoot', () => {
  it('falls back to the first category for jobs saved before `root` existed', () => {
    expect(jobRoot({ categories: ['Category:Old', 'Category:Old/A'] })).toBe('Category:Old');
    expect(jobRoot({ root: 'Category:New', categories: ['Category:New/A'] })).toBe('Category:New');
  });
});
