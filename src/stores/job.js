import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { getValidToken, refreshToken } from '../auth/oauth';
import { db } from '../engine/db';
import { getEngine, proxy } from '../engine/client';
import { retryFailed } from '../engine/downloader';

import { applyLimits, createJob, deleteJob, findUnfinishedJob, getUnfinishedJob } from '../engine/jobs';
import { normalizeCategory } from '../api/commons';
import { appRouter } from '../router';
import { categoryLocation, jobRoot } from '../utils/categoryPath';
import { useAuthStore } from './auth';
import { useSetupStore } from './setup';

export const useJobStore = defineStore('job', () => {
  const auth = useAuthStore();
  const jobId = ref(null);
  // 'stopping' = Pause clicked, engine still winding down (in-flight downloads, README).
  const phase = ref('idle');
  const message = ref(null);
  const readme = ref(null);
  const folder = ref(null);
  // Root category of the open job ("Category:Foo bar"): the job's page is /Category:Foo_bar.
  const category = ref(null);
  // shallowRef: a reactive Proxy around a FileSystemDirectoryHandle breaks its methods and structured cloning.
  const unfinished = shallowRef(null);

  const getToken = async (force) => {
    const t = force ? await refreshToken() : await getValidToken();
    if (t) auth.token = t.accessToken;
    return t?.accessToken ?? null;
  };

  /**
   * Refresh `unfinished`, which drives every Resume button. While a job is open (its /Category:… page) it means
   * "the open job still has work"; otherwise "the latest job with work", offered on the start page.
   */
  async function checkUnfinished() {
    unfinished.value = (jobId.value ? await getUnfinishedJob(jobId.value) : await findUnfinishedJob()) ?? null;
  }

  /**
   * Make `job` the open one (the one the page shows and the progress store polls). Everything is set together and
   * `jobId` LAST, so anything that reacts to `jobId` or asks "is this category open?" sees a complete job. Setting
   * the category late (after an await) once let the page re-attach in between and overwrite a run that was starting.
   */
  function openJob(job) {
    category.value = jobRoot(job);
    folder.value = job.folder ?? null;
    readme.value = null;
    message.value = null;
    jobId.value = job.id;
  }

  /**
   * Open the download of a category for its /Category:… page: the open job if it is that category, else the
   * latest job for it in IndexedDB. Returns 'ok', 'missing' (none in this browser) or 'busy' (a different job is running).
   * @param {string} title any spelling: "Category:Foo_bar", "category:Foo bar", …
   * @returns {Promise<'ok' | 'missing' | 'busy'>}
   */
  async function attachCategory(title) {
    const wanted = normalizeCategory(title);
    if (jobId.value && category.value === wanted) return 'ok';
    if (phase.value === 'running' || phase.value === 'stopping') return 'busy';
    const jobs = await db.jobs.toArray();
    const job = jobs.filter((j) => jobRoot(j) === wanted).sort((x, y) => Number(y.id) - Number(x.id))[0];
    if (!job) return 'missing';
    const c = await db.counters.get(job.id);
    const finished = job.enumDone && job.enumerated - (c?.done ?? 0) - (c?.failed ?? 0) <= 0;
    openJob(job);
    unfinished.value = finished ? null : job; // a finished job has nothing to resume
    phase.value = finished ? 'done' : 'stopped';
    return 'ok';
  }

  /** One run at a time across tabs (Web Locks); keeps the screen awake while running. */
  async function run(job, dir) {
    openJob(job); // before any await: the page may look at the store the moment the address changes
    await applyLimits(job.id, auth.botSpeed === 'on');
    const res = await navigator.locks.request('commonsflow-run', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        phase.value = 'error';
        message.value = 'A download is already running in another tab.';
        return;
      }
      let wake;
      try {
        wake = await navigator.wakeLock?.request('screen');
      } catch {
        /* best effort */
      }
      void navigator.storage?.persist?.();
      try {
        await getEngine().run(
          job.id,
          dir,
          proxy(getToken),
          proxy((s) => {
            if (phase.value === 'stopping' && s.phase === 'running') return;
            phase.value = s.phase;
            message.value = s.message ?? null;
            if (s.readme) readme.value = s.readme;
          }),
        );
      } finally {
        await wake?.release().catch(() => undefined);
      }
    });
    void res;
    await checkUnfinished();
  }

  /** The Start button: let the user pick the folder, then begin. */
  async function chooseFolderAndStart() {
    try {
      await startNew(await window.showDirectoryPicker({ mode: 'readwrite', id: 'commonsflow' }));
    } catch (e) {
      if (e.name !== 'AbortError') auth.error = e.message;
    }
  }

  async function startNew(dir) {
    const setup = useSetupStore();
    const job = await createJob(setup.rootTitle, setup.selectedCategories, setup.form, dir, setup.approxTotal, auth.botSpeed === 'on');
    unfinished.value = null;
    void appRouter().push(categoryLocation(jobRoot(job))); // the download's page; `run` below fills the store
    await run(job, dir);
  }

  /** `dir` is a freshly picked folder, or omitted to reuse the remembered handle (needs a user gesture for permission). */
  async function resume(dir) {
    const job = unfinished.value;
    if (!job) return;
    let handle = dir ?? job.dirHandle;
    if (!handle) throw new Error('Pick the download folder again.');
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Folder permission denied.');
    if (dir) await db.jobs.update(job.id, { dirHandle: dir });
    unfinished.value = null;
    void appRouter().push(categoryLocation(jobRoot(job)));
    await run(job, handle);
  }

  function stop() {
    phase.value = 'stopping';
    void getEngine().stop();
  }

  const resumeError = ref(null);
  /** Resume with the remembered folder; if that is unavailable or refused, let the user pick it again. */
  async function resumeOrPick() {
    resumeError.value = null;
    try {
      await resume();
    } catch {
      try {
        await resume(await window.showDirectoryPicker({ mode: 'readwrite', id: 'commonsflow' }));
      } catch (e) {
        if (e.name !== 'AbortError') resumeError.value = e.message;
      }
    }
  }

  async function discard() {
    if (unfinished.value) await deleteJob(unfinished.value.id);
    unfinished.value = null;
  }

  async function requeueFailed() {
    if (!jobId.value) return;
    await retryFailed(db, jobId.value);
    // Workers exit when the queue ends, so the requeued files need a new run: surface the resume prompt.
    if (phase.value !== 'running') await checkUnfinished();
  }

  return {
    jobId,
    phase,
    message,
    readme,
    folder,
    unfinished,
    resumeError,
    resumeOrPick,
    checkUnfinished,
    attachCategory,
    category,
    chooseFolderAndStart,
    startNew,
    resume,
    stop,
    discard,
    requeueFailed,
  };
});
