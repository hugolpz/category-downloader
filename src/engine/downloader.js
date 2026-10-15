import { itemRecord } from './metadata';
import { itemPath, sidecarPath } from './paths';

export class HttpError extends Error {
  constructor(status, retryAfterMs) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}
const NON_RETRYABLE = new Set([400, 403, 404, 410, 451]);

export const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });

/** Stream one file to the sink. Size is verified BEFORE commit, so a short read never leaves a file. */
export async function downloadOne(item, deps, signal) {
  const res = await deps.fetchFn(item.url, { signal });
  if (!res.ok || !res.body) {
    const ra = Number(res.headers.get('Retry-After'));
    throw new HttpError(res.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
  }
  const out = await deps.sink.open(itemPath(item));
  let bytes = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      await out.write(value);
    }
    if (item.size && bytes !== item.size) throw new Error(`size mismatch: got ${bytes}, expected ${item.size}`);
    await out.close();
  } catch (e) {
    await out.abort().catch(() => undefined);
    throw e;
  }
}

/** The compact row kept for a finished file (see Item). */
export const slim = (item, attempts) => ({
  pageid: item.pageid,
  jobId: item.jobId,
  seq: item.seq,
  title: item.title,
  url: '',
  descriptionurl: '',
  descriptionshorturl: '',
  size: 0,
  sha1: '',
  user: '',
  status: 'done',
  attempts,
});

const RECENT = 20;
const newCounters = (jobId) => ({ jobId, done: 0, failed: 0, lowWater: 0, recent: [] });

/** Failed items go back to the queue; lowWater is rewound so the next run's scan finds them. */
export async function retryFailed(db, jobId) {
  const range = (t) => t.where('[jobId+seq]').between([jobId, 0], [jobId, Infinity]);
  return db.transaction('rw', db.items, db.failures, db.counters, async () => {
    const rows = await range(db.failures).toArray();
    if (!rows.length) return 0;
    await db.items.bulkPut(rows.map((r) => ({ ...r, status: 'pending', attempts: 0, lastError: undefined })));
    await range(db.failures).delete();
    const c = (await db.counters.get(jobId)) ?? newCounters(jobId);
    c.failed = Math.max(0, c.failed - rows.length);
    c.lowWater = Math.min(c.lowWater, rows[0].seq);
    await db.counters.put(c);
    return rows.length;
  });
}

/**
 * Scan forward from the persisted low-water mark; `next` is the in-memory claim cursor.
 * Nothing is persisted when an item is claimed: a crash simply rescans from lowWater, and rows already
 * done in that window are skipped. In-flight seqs hold lowWater back so no unfinished item is ever passed.
 */
export async function runDownloads(db, jobId, deps, opts = {}) {
  const { signal, maxRetries = 3, idleMs = 500 } = opts;
  const job = await db.jobs.get(jobId);
  const random = deps.random ?? Math.random;
  let next = (await db.counters.get(jobId))?.lowWater ?? 0;
  const inflight = new Set();
  let coolUntil = 0; // shared across workers: one 429 slows everybody

  // Claims are serialised so two workers never take the same row.
  let chain = Promise.resolve();
  const claim = () => {
    const p = chain.then(async () => {
      const enumDone = (await db.jobs.get(jobId))?.enumDone ?? false; // read BEFORE scanning (see race note)
      for (;;) {
        const rows = await db.items.where('[jobId+seq]').between([jobId, next], [jobId, Infinity]).limit(50).toArray();
        if (!rows.length) return enumDone ? 'end' : 'wait';
        for (const r of rows) {
          next = r.seq + 1;
          if (r.status === 'pending') {
            inflight.add(r.seq);
            return r;
          }
        }
      }
    });
    chain = p.catch(() => undefined);
    return p;
  };

  /** Record the end state of an item atomically with the counters and the new low-water mark. */
  async function finish(item, outcome) {
    inflight.delete(item.seq);
    await db.transaction('rw', db.items, db.failures, db.counters, async () => {
      const c = (await db.counters.get(jobId)) ?? newCounters(jobId);
      if ('done' in outcome) {
        await db.items.put(outcome.done);
        c.done++;
        c.recent = [itemPath(item)[2], ...c.recent].slice(0, RECENT);
      } else {
        await db.items.put(outcome.failed);
        await db.failures.put(outcome.failed);
        c.failed++;
      }
      c.lowWater = inflight.size ? Math.min(...inflight) : next;
      await db.counters.put(c);
    });
  }

  async function processItem(item) {
    for (let attempt = 0; ; attempt++) {
      try {
        await downloadOne(item, deps, signal);
        // Always written (not optional): contributors must be credited via backlink, user's name and license,
        // and this record carries exactly those (descriptionurl, user, extmetadata.License*).
        await deps.sink.writeText(sidecarPath(item), JSON.stringify(itemRecord(item), null, 2));
        await finish(item, { done: slim(item, attempt) });
        return;
      } catch (e) {
        // Interrupted, not failed. Deliberately stays in `inflight` so lowWater cannot pass it.
        if (signal?.aborted) return;
        const err = e;
        const status = e instanceof HttpError ? e.status : 0;
        if (NON_RETRYABLE.has(status) || attempt >= maxRetries) {
          await finish(item, { failed: { ...item, status: 'failed', attempts: attempt + 1, lastError: err.message } });
          return;
        }
        const wait = (e instanceof HttpError && e.retryAfterMs) || 1000 * 2 ** attempt * (0.5 + random());
        if (status === 429 || status === 503) coolUntil = Math.max(coolUntil, Date.now() + wait);
        await deps.sleep(wait, signal);
      }
    }
  }

  async function worker() {
    while (!signal?.aborted) {
      const wait = coolUntil - Date.now();
      if (wait > 0) await deps.sleep(wait, signal);
      const item = await claim();
      if (item === 'end') return; // nothing left and listing is complete
      if (item === 'wait') {
        await deps.sleep(idleMs, signal);
        continue;
      }
      await processItem(item);
      await deps.sleep(job.options.delayMs, signal);
    }
  }

  await Promise.all(Array.from({ length: job.options.concurrency }, worker));
  // Clean finish (every worker saw the end, nothing in flight): the scan has passed any rows that were
  // already done, so record that. If aborted, an interrupted seq is still in `inflight` and we must not.
  if (!signal?.aborted && !inflight.size) await db.counters.update(jobId, { lowWater: next });
}
