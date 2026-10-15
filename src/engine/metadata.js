import { metadataShardPath } from './paths';

/** The metadata we keep for a file: shared by the NDJSON shards and the per-file .json (the credit data: backlink, user, license). */
export const itemRecord = (i) => ({
  pageid: i.pageid,
  title: i.title,
  url: i.url,
  descriptionurl: i.descriptionurl,
  descriptionshorturl: i.descriptionshorturl,
  size: i.size,
  sha1: i.sha1,
  user: i.user,
  extmetadata: i.meta ?? {},
});

/**
 * One NDJSON shard per API page, written from the rows in hand BEFORE the page is committed
 * (done rows are later slimmed, so the full details must not be needed afterwards).
 * The name is deterministic, so a crash and rewrite is idempotent.
 */
export async function writeMetadataShard(sink, pageNo, rows) {
  if (!rows.length) return;
  await sink.writeText(metadataShardPath(pageNo), rows.map((i) => JSON.stringify(itemRecord(i))).join('\n') + '\n');
}
