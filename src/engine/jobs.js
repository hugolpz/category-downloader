import { db } from './db';
import { folderName } from './paths';

export const limitsFor = (botSpeed) => (botSpeed ? { pageSize: 5000, imageinfoBatch: 500 } : { pageSize: 500, imageinfoBatch: 50 });

export async function createJob(root, form, dir, approxTotal, botSpeed) {
  const job = {
    id: `${Date.now()}`,
    categories: [root, ...form.subcats],
    cursors: {},
    enumDone: false,
    ...limitsFor(botSpeed),
    options: { sidecars: form.sidecars, delayMs: form.delayMs, concurrency: form.concurrency },
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

/** Most recent job that still has work: more to list, or listed files not yet finished. */
export async function findUnfinishedJob() {
  const jobs = await db.jobs.orderBy('id').reverse().toArray();
  for (const j of jobs) {
    const c = await db.counters.get(j.id);
    if (!j.enumDone || j.enumerated - (c?.done ?? 0) - (c?.failed ?? 0) > 0) return j;
  }
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
