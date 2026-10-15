/** Everything the progress panel shows: two single-row reads and one 60-row window. Cost is independent of job size. */
export async function readProgress(db, id) {
  const [job, c] = await Promise.all([db.jobs.get(id), db.counters.get(id)]);
  const done = c?.done ?? 0;
  const failed = c?.failed ?? 0;
  const enumerated = job?.enumerated ?? 0;
  // "Next" = the first still-pending rows from the low-water mark (may include files currently downloading).
  const window = await db.items
    .where('[jobId+seq]')
    .between([id, c?.lowWater ?? 0], [id, Infinity])
    .limit(60)
    .toArray();
  return {
    counts: { pending: Math.max(0, enumerated - done - failed), done, failed },
    enumerated,
    enumDone: job?.enumDone ?? false,
    approxTotal: job?.approxTotal ?? 0,
    recent: c?.recent ?? [],
    activeMs: c?.activeMs ?? 0,
    upcoming: window
      .filter((r) => r.status === 'pending')
      .slice(0, 20)
      .map((r) => r.title.replace(/^File:/, '')),
  };
}
