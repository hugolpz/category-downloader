import { sleep } from './downloader';

/** The only extmetadata keys we keep. Also sent as `iiextmetadatafilter`, so the server returns just these. */
export const EXTMETADATA_KEYS = ['DateTime', 'DateTimeOriginal', 'LicenseShortName', 'AttributionRequired', 'LicenseUrl', 'License'];
export const IIPROP = 'url|size|sha1|user|extmetadata';

function trimMeta(ext) {
  const out = {};
  for (const k of EXTMETADATA_KEYS) if (ext?.[k]?.value != null) out[k] = String(ext[k].value);
  return out;
}

/**
 * Fetch ONE page of a category and commit it atomically:
 * item rows + page record + the next cursor all land in a single IndexedDB transaction,
 * so the saved cursor can never be ahead of the saved data.
 * Returns false when the whole job is fully enumerated.
 */
export async function enumerateStep(db, api, jobId, beforeCommit) {
  const job = await db.jobs.get(jobId);
  if (!job) throw new Error(`Unknown job ${jobId}`);
  const category = job.categories.find((c) => !job.cursors[c]?.done);
  if (!category) {
    if (!job.enumDone) await db.jobs.update(jobId, { enumDone: true });
    return false;
  }
  const cursor = job.cursors[category] ?? { done: false };

  const list = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: category,
    cmtype: 'file',
    cmsort: 'sortkey',
    cmlimit: String(job.pageSize),
    ...(cursor.cmcontinue ? { cmcontinue: cursor.cmcontinue } : {}),
  });
  const members = list.query.categorymembers;

  const rows = [];
  for (let i = 0; i < members.length; i += job.imageinfoBatch) {
    const ids = members.slice(i, i + job.imageinfoBatch).map((m) => m.pageid);
    const info = await api({
      action: 'query',
      prop: 'imageinfo',
      pageids: ids.join('|'),
      iiprop: IIPROP,
      iiextmetadatafilter: EXTMETADATA_KEYS.join('|'),
    });
    for (const p of info.query.pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue; // deleted/missing between the two calls
      rows.push({
        seq: 0, // assigned just before commit
        meta: trimMeta(ii.extmetadata),
        pageid: p.pageid,
        jobId,
        title: p.title,
        url: ii.url,
        size: ii.size,
        sha1: ii.sha1,
        descriptionurl: ii.descriptionurl ?? '',
        descriptionshorturl: ii.descriptionshorturl ?? '',
        user: ii.user,
        status: 'pending',
        attempts: 0,
      });
    }
  }

  const next = list.continue?.cmcontinue;
  // Only this loop writes `enumerated`/`pageCount`, so seq and page number can be fixed before the transaction.
  const known = new Set(
    (
      await db.items
        .where('[jobId+pageid]')
        .anyOf(rows.map((r) => [jobId, r.pageid]))
        .toArray()
    ).map((i) => i.pageid),
  );
  const fresh = rows.filter((r) => !known.has(r.pageid)); // keep rows a previous run (or category) already handled
  const n = job.pageCount + 1;
  fresh.forEach((r, i) => {
    r.seq = job.enumerated + i;
  });
  // Deterministic, idempotent side effect (metadata shard) BEFORE the commit: a crash here just rewrites it.
  await beforeCommit?.(fresh, n);

  await db.transaction('rw', db.jobs, db.items, async () => {
    await db.items.bulkAdd(fresh);
    const cur = await db.jobs.get(jobId);
    cur.cursors[category] = { cmcontinue: next, done: !next };
    cur.enumerated += fresh.length;
    cur.pageCount = n;
    cur.enumDone = cur.categories.every((c) => cur.cursors[c]?.done);
    await db.jobs.put(cur);
  });
  return true;
}

/** Drive enumerateStep until done, aborted, or too many items are queued. Safe to call again after a crash. */
export async function runEnumeration(db, api, jobId, opts = {}) {
  const maxPending = opts.maxPending ?? 5000;
  for (;;) {
    if (opts.signal?.aborted) return;
    const [cur, c] = await Promise.all([db.jobs.get(jobId), db.counters.get(jobId)]);
    const pending = (cur?.enumerated ?? 0) - (c?.done ?? 0) - (c?.failed ?? 0);
    if (pending >= maxPending) {
      await sleep(1000, opts.signal);
      continue;
    }
    const more = await enumerateStep(db, api, jobId, opts.beforeCommit);
    const job = await db.jobs.get(jobId);
    if (job) await opts.onProgress?.(job);
    if (!more) return;
  }
}
