import { db } from './db';
import { normalizeFilter } from './filter';
import { folderName } from './paths';

export const limitsFor = (botSpeed) => (botSpeed ? { pageSize: 5000, imageinfoBatch: 500 } : { pageSize: 500, imageinfoBatch: 50 });

/**
 * @param {string} root the top category ("Category:Foo"): names the page and the folder
 * @param {string[]} categories what to list and download. Includes `root` only if its own files are wanted
 */
export async function createJob(root, categories, form, dir, approxTotal, botSpeed) {
  const job = {
    id: `${Date.now()}`,
    root,
    categories,
    cursors: {},
    enumDone: false,
    ...limitsFor(botSpeed),
    options: { delayMs: form.delayMs, concurrency: form.concurrency },
    filter: normalizeFilter(form.filter),
    approxTotal,
    enumerated: 0,
    pageCount: 0,
    startedAt: Date.now(),
    dirHandle: dir,
    folder: folderName(root),
  };
  await db.jobs.put(job);
  await db.counters.put({ jobId: job.id, done: 0, failed: 0, lowWater: 0, recent: [] });
  return job;
}

/** Limits depend on the CURRENT login (bot speed may differ from when the job was created). */
export async function applyLimits(jobId, botSpeed) {
  await db.jobs.update(jobId, limitsFor(botSpeed));
}

/** A job has work left if listing is unfinished or listed files are not yet done/failed. */
async function hasWork(job) {
  const c = await db.counters.get(job.id);
  return !job.enumDone || job.enumerated - (c?.done ?? 0) - (c?.failed ?? 0) > 0;
}

/** The job with this id if it still has work, else undefined. */
export async function getUnfinishedJob(id) {
  const job = await db.jobs.get(id);
  return job && (await hasWork(job)) ? job : undefined;
}

/** Most recent job that still has work: more to list, or listed files not yet finished. */
export async function findUnfinishedJob() {
  const jobs = await db.jobs.orderBy('id').reverse().toArray();
  for (const j of jobs) if (await hasWork(j)) return j;
  return undefined;
}

export async function deleteJob(jobId) {
  const range = [
    [jobId, 0],
    [jobId, Infinity],
  ];
  await db.transaction('rw', db.jobs, db.items, db.failures, db.counters, async () => {
    await db.items
      .where('[jobId+seq]')
      .between(...range)
      .delete();
    await db.failures
      .where('[jobId+seq]')
      .between(...range)
      .delete();
    await db.counters.delete(jobId);
    await db.jobs.delete(jobId);
  });
}
