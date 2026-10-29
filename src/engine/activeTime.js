/**
 * Add up how long a download actually ran, across every run of that job (pauses, reloads, crashes), into the job's
 * counters row (`activeMs`). It is saved every `intervalMs` while running and once more on stop(), so a crash loses
 * at most one interval. This is what the summary cards use for "Time taken" and "Average speed".
 *
 * The update uses `modify`, one atomic step on the row as it is NOW: the downloader updates the same row on every
 * finished file, and a read-then-write here could overwrite its counts with stale ones.
 *
 * @param {import('./db').CategoryDownloaderDB} db
 * @param {string} jobId
 * @param {{ intervalMs?: number, now?: () => number }} [options]
 */
export function trackActiveTime(db, jobId, { intervalMs = 10_000, now = Date.now } = {}) {
  let last = now();

  async function flush() {
    const t = now();
    const elapsed = t - last;
    last = t;
    if (elapsed <= 0) return;
    await db.counters
      .where(':id')
      .equals(jobId)
      .modify((c) => {
        c.activeMs = (c.activeMs ?? 0) + elapsed;
      });
  }

  const timer = setInterval(() => void flush().catch(() => undefined), intervalMs);

  return {
    flush,
    /** Stop the clock and save what is left. */
    async stop() {
      clearInterval(timer);
      await flush().catch(() => undefined);
    },
  };
}
