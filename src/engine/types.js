/**
 * Data shapes used across the engine, documented with JSDoc so editors (VS Code, WebStorm) show hints.
 * There is no build step for these: this file only holds comments. Reference a type from anywhere with
 *   @param {import('./types.js').Item} item
 */

/**
 * @typedef {'pending' | 'done' | 'failed'} ItemStatus
 */

/**
 * A queue row, keyed by [jobId+seq] (listing order). Nothing in the DB is indexed by status: scanning forward
 * from the low-water mark is O(1), whereas counting/scanning a status index was O(n) (seconds at 100k rows).
 * Once done, the row is SLIMMED: url/links/sha1/user/meta are dropped (set to ''/0), keeping dedupe + audit data.
 *
 * @typedef {object} Item
 * @property {number} pageid
 * @property {string} jobId
 * @property {number} seq Position in listing order; also drives the 1,000-files-per-folder sharding.
 * @property {string} title
 * @property {string} url
 * @property {number} size
 * @property {string} sha1
 * @property {string} descriptionurl Commons file-page link, returned together with `url` by imageinfo.
 * @property {string} descriptionshorturl
 * @property {string} user Uploader.
 * @property {ItemStatus} status
 * @property {number} attempts
 * @property {string} [lastError]
 * @property {Record<string, string>} [meta] Only the extmetadata keys we ask for (see EXTMETADATA_KEYS).
 */

/**
 * Tiny per-job row updated on every completion: replaces all counting queries.
 *
 * @typedef {object} Counters
 * @property {string} jobId
 * @property {number} done
 * @property {number} failed
 * @property {number} lowWater Lowest seq not yet finished. Resume scans forward from here; rows above it that are done are skipped.
 * @property {string[]} recent Names of the last 20 finished files, newest first (the "previous files" log).
 */

/**
 * @typedef {object} CategoryCursor
 * @property {string} [cmcontinue] Opaque `cmcontinue` of the NEXT page to fetch; undefined = start.
 * @property {boolean} done
 */

/**
 * @typedef {object} JobOptions
 * @property {number} delayMs
 * @property {number} concurrency
 */

/**
 * @typedef {object} Job
 * @property {string} id
 * @property {string[]} categories Root category plus chosen subcategories (full titles, "Category:…"), enumerated in order.
 * @property {Record<string, CategoryCursor>} cursors
 * @property {boolean} enumDone
 * @property {number} pageSize
 * @property {number} imageinfoBatch
 * @property {JobOptions} options
 * @property {number} approxTotal Approximate total from categoryinfo, for the progress counter.
 * @property {number} enumerated
 * @property {number} pageCount API pages committed so far (numbers the metadata shards).
 * @property {number} startedAt
 * @property {FileSystemDirectoryHandle} [dirHandle]
 * @property {string} [folder] Subfolder of the chosen directory holding this job's files. Absent on jobs created before it existed.
 */

export {};
