import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { getValidToken, refreshToken } from '../auth/oauth';
import { db } from '../engine/db';
import { getEngine, proxy } from '../engine/client';
import { retryFailed } from '../engine/downloader';

import { applyLimits, createJob, deleteJob, findUnfinishedJob } from '../engine/jobs';

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
  // shallowRef: a reactive Proxy around a FileSystemDirectoryHandle breaks its methods and structured cloning.
  const unfinished = shallowRef(null);

  const getToken = async (force) => {
    const t = force ? await refreshToken() : await getValidToken();
    if (t) auth.token = t.accessToken;
    return t?.accessToken ?? null;
  };

  async function checkUnfinished() {
    unfinished.value = (await findUnfinishedJob()) ?? null;
  }

  /** One run at a time across tabs (Web Locks); keeps the screen awake while running. */
  async function run(id, dir) {
    jobId.value = id;
    readme.value = null;
    folder.value = (await db.jobs.get(id))?.folder ?? null;
    await applyLimits(id, auth.botSpeed === 'on');
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
          id,
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

  async function startNew(dir) {
    const setup = useSetupStore();
    const job = await createJob(setup.rootTitle, setup.form, dir, setup.approxTotal, auth.botSpeed === 'on');
    unfinished.value = null;
    await run(job.id, dir);
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
    await run(job.id, handle);
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
    startNew,
    resume,
    stop,
    discard,
    requeueFailed,
  };
});
