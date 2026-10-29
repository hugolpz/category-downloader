import Dexie from 'dexie';

/**
 * IndexedDB schema (via Dexie). Tables:
 *  - jobs      {@link import('./types.js').Job}
 *  - items     {@link import('./types.js').Item}, one row per file, keyed by [jobId+seq]
 *  - failures  {@link import('./types.js').Item}, failed items kept for retry/export; small by nature
 *  - counters  {@link import('./types.js').Counters}, one row per job, updated on every completion
 */
export class CategoryDownloaderDB extends Dexie {
  // New name: the first layout (status index) did not scale and cannot be migrated in place.
  constructor(name = 'category-downloader-v2') {
    super(name);
    this.version(1).stores({
      jobs: 'id',
      // Ordered by listing position; the only secondary index is the unique page id used for dedupe.
      items: '[jobId+seq], &[jobId+pageid]',
      failures: '[jobId+seq]',
      counters: 'jobId',
    });
  }
}

export const db = new CategoryDownloaderDB();
