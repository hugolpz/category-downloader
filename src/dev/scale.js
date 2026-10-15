import { db } from '../engine/db';
import { runDownloads, sleep } from '../engine/downloader';
import { deleteJob } from '../engine/jobs';
import { readProgress } from '../engine/stats';

const ID = 'scale-test';
const N = Number(new URLSearchParams(location.search).get('n') ?? 500_000);
const out = document.getElementById('out');
const log = (s) => {
  out.textContent += s + '\n';
  console.log(s);
};
const heapMB = () => (performance.memory?.usedJSHeapSize / 1048576)?.toFixed(0) ?? 'n/a';
const storageMB = async () => ((await navigator.storage.estimate()).usage / 1048576).toFixed(0);
const ms = (t) => (performance.now() - t).toFixed(0);

/** A row the size of a real one: Lingua Libre-style title, upload URL, sha1, mime, user. Body is 1 byte. */
const fake = (i) => ({
  pageid: 1_000_000 + i,
  jobId: ID,
  seq: i,
  title: `File:LL-Q150 (fra)-Speaker${i % 997}-mot-numero-${i}.wav`,
  url: `https://upload.wikimedia.org/wikipedia/commons/${(i % 16).toString(16)}/${(i % 256).toString(16).padStart(2, '0')}/LL-Q150_(fra)-Speaker${i % 997}-mot-numero-${i}.wav`,
  size: 1,
  sha1: (i.toString(16) + 'a'.repeat(40)).slice(0, 40),
  descriptionurl: `https://commons.wikimedia.org/wiki/File:LL-${i}.wav`,
  descriptionshorturl: `https://commons.wikimedia.org/w/index.php?curid=${1_000_000 + i}`,
  user: `Speaker${i % 997}`,
  status: 'pending',
  attempts: 0,
});

/**
 * Runs the REAL engine (claim, finish transaction, counters, lowWater) against a fake network and a no-op disk,
 * and times the exact query the progress panel polls while it runs.
 */
async function run() {
  out.textContent = '';
  log(`Seeding ${N.toLocaleString()} rows…  (baseline: heap ${heapMB()} MB, storage ${await storageMB()} MB)`);
  await deleteJob(ID);
  const job = {
    id: ID,
    categories: ['Category:Scale'],
    cursors: {},
    enumDone: true,
    pageSize: 500,
    imageinfoBatch: 50,
    options: { sidecars: false, delayMs: 0, concurrency: 4 },
    approxTotal: N,
    enumerated: N,
    pageCount: 0,
    startedAt: Date.now(),
  };
  await db.jobs.put(job);
  await db.counters.put({ jobId: ID, done: 0, failed: 0, lowWater: 0, recent: [] });
  let t = performance.now();
  for (let i = 0; i < N; i += 5000) {
    await db.items.bulkAdd(Array.from({ length: Math.min(5000, N - i) }, (_, k) => fake(i + k)));
    if ((i + 5000) % 50_000 === 0) log(`  …seeded ${(i + 5000).toLocaleString()} (${ms(t)} ms, heap ${heapMB()} MB)`);
  }
  log(`Seeded in ${ms(t)} ms.  Storage with all rows pending: ${await storageMB()} MB (estimate; includes uncompacted leftovers)`);

  const slowest = { ms: 0, at: 0 };
  let polls = 0;
  const poller = setInterval(async () => {
    const q = performance.now();
    const snap = await readProgress(db, ID);
    const took = performance.now() - q;
    polls++;
    if (took > slowest.ms) Object.assign(slowest, { ms: took, at: snap.counts.done });
    if (polls % 10 === 0)
      log(
        `  done ${snap.counts.done.toLocaleString()} / ${N.toLocaleString()}   progress query ${took.toFixed(0)} ms   heap ${heapMB()} MB`,
      );
  }, 700);

  t = performance.now();
  const fetchFn = async () => new Response(new Uint8Array(1));
  const sink = { open: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} }), writeText: async () => {} };
  await runDownloads(db, ID, { sink, fetchFn, sleep });
  clearInterval(poller);

  const snap = await readProgress(db, ID);
  const secs = (performance.now() - t) / 1000;
  log(
    `\nEngine finished: ${snap.counts.done.toLocaleString()} done, ${snap.counts.failed} failed in ${secs.toFixed(0)} s (${(snap.counts.done / secs).toFixed(0)} files/s of pure DB work)`,
  );
  log(
    `Slowest progress query: ${slowest.ms.toFixed(0)} ms (at ${slowest.at.toLocaleString()} done).  Final heap ${heapMB()} MB.  Storage ${await storageMB()} MB`,
  );
  log(`Pass: slowest query well under ~100 ms, heap flat (tens of MB), done == ${N.toLocaleString()}, failed == 0.`);
}

document.getElementById('run').onclick = () => run().catch((e) => log(`ERROR: ${e}`));
document.getElementById('clean').onclick = async () => (await deleteJob(ID), log('Deleted.'));
