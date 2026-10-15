import { apiGet, AuthExpiredError } from '../api/commons';
import { db } from './db';
import { trackActiveTime } from './activeTime';
import { runDownloads, sleep } from './downloader';
import { runEnumeration } from './enumerator';
import { writeMetadataShard } from './metadata';
import { writeReadme } from './readme';
import { fsaSink } from './sink';

class AuthRequired extends Error {}

/** Runs inside a dedicated Worker so 500k-item bookkeeping never janks the UI. Progress is read from IndexedDB. */
export class Engine {
  ac;

  stop() {
    this.ac?.abort();
  }

  async run(jobId, dir, getToken, onState) {
    const ac = (this.ac = new AbortController());
    const { signal } = ac;

    // API calls: refresh the token once on expiry, back off on transient failures.
    const api = async (params) => {
      let token = await getToken();
      let refreshed = false;
      for (let attempt = 0; ; attempt++) {
        if (!token) throw new AuthRequired();
        try {
          return await apiGet(params, token);
        } catch (e) {
          if (e instanceof AuthExpiredError) {
            if (refreshed) throw new AuthRequired();
            refreshed = true;
            token = await getToken(true);
            attempt--;
            continue;
          }
          if (attempt >= 3 || signal.aborted) throw e;
          await sleep(1000 * 2 ** attempt, signal);
        }
      }
    };

    let sink;
    let timing; // how long this run lasted, added to the job's saved total
    const finish = async (phase, message) => {
      await timing?.stop();
      const readme = sink ? await writeReadme(db, sink, jobId, phase).catch(() => undefined) : undefined;
      onState({ phase, message, readme });
    };

    try {
      onState({ phase: 'running' });
      timing = trackActiveTime(db, jobId);
      const job = await db.jobs.get(jobId);
      if (!job) throw new Error('Job not found');
      const out = (sink = fsaSink(dir, job.folder));
      await writeReadme(db, out, jobId, 'running').catch(() => undefined); // present even if we crash

      const enumeration = (
        job.enumDone
          ? Promise.resolve()
          : runEnumeration(db, api, jobId, { signal, beforeCommit: (rows, n) => writeMetadataShard(out, n, rows) })
      ).catch((e) => {
        ac.abort(); // listing failed or needs login: stop the download workers too
        throw e;
      });
      const downloads = runDownloads(db, jobId, { sink: out, fetchFn: (u, i) => fetch(u, i), sleep }, { signal });
      await Promise.all([enumeration, downloads]);
      await finish(signal.aborted ? 'stopped' : 'done');
    } catch (e) {
      if (e instanceof AuthRequired) await finish('paused-auth', 'Login expired. Log in again, then resume.');
      else await finish('error', e.message);
    }
  }
}
