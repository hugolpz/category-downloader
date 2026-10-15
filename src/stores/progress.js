import { defineStore } from 'pinia';
import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import { db } from '../engine/db';
import { readProgress } from '../engine/stats';

import { sessionSummary } from '../utils/session';
import { useJobStore } from './job';

/** Polls indexed counts and two tiny windows from IndexedDB: memory and DOM stay constant at any job size. */
export const useProgressStore = defineStore('progress', () => {
  const counts = reactive({ pending: 0, done: 0, failed: 0 });
  const total = ref(0);
  const enumerated = ref(0);
  const enumDone = ref(false);
  const recent = ref([]);
  const upcoming = ref([]);
  const perSecond = ref(0); // live speed, only meaningful while running
  const nowMs = ref(Date.now());
  // Timing of the current run in this page session; frozen when the run ends.
  const session = reactive({ startedAt: 0, startDone: 0, endedAt: 0 });
  const job = useJobStore();
  const samples = [];
  let timer;
  let current = null;

  async function tick() {
    const id = current;
    if (!id) return;
    const snap = await readProgress(db, id);
    Object.assign(counts, snap.counts);
    enumerated.value = snap.enumerated;
    enumDone.value = snap.enumDone;
    // Best estimate of the total: exact once listing is done, else the category's reported size.
    total.value = snap.enumDone ? snap.enumerated : Math.max(snap.approxTotal, snap.enumerated);
    recent.value = snap.recent;
    upcoming.value = snap.upcoming;
    const done = snap.counts.done;

    const now = (nowMs.value = Date.now());
    // Everything is saved: stop the clocks at the moment we see it, not when the README is written.
    if (session.startedAt && !session.endedAt && snap.enumDone && snap.counts.pending === 0) session.endedAt = now;
    if (session.endedAt) {
      perSecond.value = 0;
      return;
    }
    samples.push([now, done]);
    while (samples.length > 1 && now - samples[0][0] > 30_000) samples.shift();
    const [t0, d0] = samples[0];
    perSecond.value = now > t0 ? ((done - d0) / (now - t0)) * 1000 : 0;
  }

  function startPolling() {
    clearInterval(timer);
    void tick();
    timer = setInterval(tick, 700);
  }

  function watchJob(id) {
    current = id;
    samples.length = 0;
    clearInterval(timer);
    if (id) startPolling();
  }

  // Run lifecycle: start the clocks when the engine runs, freeze them (and stop polling) when it ends.
  watch(
    () => job.phase,
    async (phase, prev) => {
      if (!current) return;
      if (phase === 'running' && prev !== 'running') {
        await tick();
        Object.assign(session, { startedAt: Date.now(), startDone: counts.done, endedAt: 0 });
        samples.length = 0;
        startPolling();
      } else if (phase === 'done' || phase === 'stopped' || phase === 'paused-auth' || phase === 'error') {
        await tick();
        if (!session.endedAt) session.endedAt = Date.now();
        perSecond.value = 0;
        clearInterval(timer);
      }
    },
  );

  /** Elapsed time and average speed of this run; live while running, frozen after. */
  const summary = computed(() => sessionSummary(session, counts.done, nowMs.value));
  const freshRun = computed(() => session.startDone === 0);
  onScopeDispose(() => clearInterval(timer));

  const failures = () => db.failures.where('[jobId+seq]').between([current, 0], [current, Infinity]);

  async function failedPage(offset, limit = 20) {
    if (!current) return { rows: [], total: 0 };
    return { rows: await failures().offset(offset).limit(limit).toArray(), total: await failures().count() };
  }

  async function exportFailed() {
    const rows = current ? await failures().toArray() : [];
    return new Blob(
      [
        JSON.stringify(
          rows.map(({ pageid, title, url, attempts, lastError }) => ({ pageid, title, url, attempts, lastError })),
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
  }

  return { counts, total, enumerated, enumDone, recent, upcoming, perSecond, summary, freshRun, watchJob, failedPage, exportFailed, tick };
});
