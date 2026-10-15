import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { watch } from 'vue';
import { createMemoryHistory } from 'vue-router';

// A router on in-memory history (the real one needs a browser) and a fake engine worker.
vi.mock('../src/router', async (importOriginal) => {
  const mod = await importOriginal();
  const Stub = { render: () => null };
  const router = mod.createAppRouter({ history: createMemoryHistory(), routeTable: mod.routes.map((r) => ({ ...r, component: Stub })) });
  return { ...mod, appRouter: () => router };
});
const engine = { run: vi.fn(), stop: vi.fn() };
vi.mock('../src/engine/client', () => ({ getEngine: () => engine, proxy: (f) => f }));

import { db } from '../src/engine/db';
import { useJobStore } from '../src/stores/job';
import { mkJob } from './helpers';

let clock = Date.now();
const unfinishedJob = async (over = {}) => {
  const job = mkJob({
    id: String(clock++),
    root: 'Category:Run me',
    categories: ['Category:Run me'],
    folder: 'Run me',
    enumDone: true,
    enumerated: 5,
    ...over,
  });
  await db.jobs.put(job);
  await db.counters.put({ jobId: job.id, done: 2, failed: 0, lowWater: 2, recent: [] });
  return job;
};
// The folder handle lives only in memory here: a plain object cannot be stored in IndexedDB (a real handle can).
const withFolder = (job) => ({ ...job, dirHandle: { requestPermission: async () => 'granted' } });

beforeEach(() => {
  setActivePinia(createPinia());
  engine.run.mockReset();
  vi.stubGlobal('navigator', { locks: { request: (_name, _opts, callback) => callback({}) } }); // no wakeLock/storage: both optional
});

describe('starting or resuming a download', () => {
  it('opens the job as ONE complete unit: whoever reacts to jobId already sees its category and folder', async () => {
    const job = await unfinishedJob();
    const store = useJobStore();
    store.unfinished = withFolder(job);
    const seen = [];
    watch(
      () => store.jobId,
      (id) => id && seen.push({ id, category: store.category, folder: store.folder }),
      { flush: 'sync' }, // runs the instant jobId changes
    );
    engine.run.mockImplementation(async (_id, _dir, _token, onState) => onState({ phase: 'done' }));
    await store.resume();
    expect(seen).toEqual([{ id: job.id, category: 'Category:Run me', folder: 'Run me' }]);
  });

  it('REGRESSION: the page re-checking the category while the run is starting does not clobber it', async () => {
    const job = await unfinishedJob();
    const store = useJobStore();
    store.unfinished = withFolder(job);
    let release;
    engine.run.mockImplementation(
      (_id, _dir, _token, onState) =>
        new Promise((resolve) => {
          onState({ phase: 'running' });
          release = resolve;
        }),
    );
    const running = store.resume();
    await vi.waitFor(() => expect(store.phase).toBe('running'));

    // the /Category:… page now looks the category up (what happens when the address changes after Start)
    expect(await store.attachCategory('Category:Run_me')).toBe('ok');
    expect(store.phase).toBe('running'); // not overwritten with 'stopped'
    expect(store.unfinished).toBeNull(); // no stale Resume offer while it is running
    expect(store.jobId).toBe(job.id);

    release();
    await running;
  });

  it('a run for the open category answers "ok" even before the engine has reported anything', async () => {
    const job = await unfinishedJob();
    const store = useJobStore();
    store.unfinished = withFolder(job);
    engine.run.mockImplementation(() => new Promise(() => {})); // never reports, never ends
    void store.resume();
    await vi.waitFor(() => expect(store.jobId).toBe(job.id));
    expect(await store.attachCategory(job.root)).toBe('ok');
    expect(store.unfinished).toBeNull();
  });

  it('a different category is refused while one runs', async () => {
    const job = await unfinishedJob();
    const store = useJobStore();
    store.unfinished = withFolder(job);
    engine.run.mockImplementation((_id, _dir, _token, onState) => (onState({ phase: 'running' }), new Promise(() => {})));
    void store.resume();
    await vi.waitFor(() => expect(store.phase).toBe('running'));
    expect(await store.attachCategory('Category:Something else')).toBe('busy');
  });
});
