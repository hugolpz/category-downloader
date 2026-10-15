import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommonsFlowDB } from '../src/engine/db';
import { enumerateStep, runEnumeration } from '../src/engine/enumerator';

const TOTAL = 25;
const files = Array.from({ length: TOTAL }, (_, i) => ({ pageid: 1000 + i, title: `File:f${i}.ogg` }));

/** Fake MediaWiki: categorymembers paged by an opaque cursor, imageinfo by pageids. */
function fakeApi(opts = {}) {
  let infoCalls = 0;
  const api = async (p) => {
    if (p.list === 'categorymembers') {
      const start = p.cmcontinue ? Number(p.cmcontinue.split('|')[1]) : 0;
      const size = Number(p.cmlimit);
      const slice = files.slice(start, start + size);
      const more = start + size < TOTAL;
      return { query: { categorymembers: slice }, ...(more ? { continue: { cmcontinue: `file|${start + size}` } } : {}) };
    }
    infoCalls++;
    if (opts.failImageinfoOnCall === infoCalls) throw new Error('boom');
    const ids = p.pageids.split('|').map(Number);
    return {
      query: {
        pages: files
          .filter((f) => ids.includes(f.pageid))
          .map((f) => ({
            ...f,
            imageinfo: [
              {
                url: `https://x/${f.pageid}`,
                descriptionurl: 'https://c/d',
                descriptionshorturl: 'https://c/s',
                size: 1,
                sha1: 's',
                user: 'u',
                extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: 'dropped' } },
              },
            ],
          })),
      },
    };
  };
  return api;
}

const mkJob = (id) => ({
  id,
  categories: ['Category:T'],
  cursors: {},
  enumDone: false,
  pageSize: 10,
  imageinfoBatch: 5,
  options: { sidecars: false, delayMs: 0, concurrency: 3 },
  approxTotal: TOTAL,
  enumerated: 0,
  pageCount: 0,
  startedAt: 0,
});

let db;
beforeEach(async () => {
  db = new CommonsFlowDB(`t${Math.random()}`);
  await db.jobs.put(mkJob('j'));
});

describe('enumerator', () => {
  it('enumerates everything and finishes', async () => {
    await runEnumeration(db, fakeApi(), 'j');
    expect(await db.items.count()).toBe(TOTAL);
    const job = await db.jobs.get('j');
    expect(job.enumDone).toBe(true);
    expect(job.enumerated).toBe(TOTAL);
  });

  it('crash mid-page leaves the cursor at the last COMMITTED page, and resume has no dupes or gaps', async () => {
    // page 1 commits (2 imageinfo calls), page 2 crashes on its first imageinfo call (call 3)
    await expect(runEnumeration(db, fakeApi({ failImageinfoOnCall: 3 }), 'j')).rejects.toThrow('boom');
    const mid = await db.jobs.get('j');
    expect(mid.cursors['Category:T'].cmcontinue).toBe('file|10');
    expect(await db.items.count()).toBe(10);

    await runEnumeration(db, fakeApi(), 'j'); // "restart": new run, same DB
    expect(await db.items.count()).toBe(TOTAL);
    expect((await db.jobs.get('j')).enumerated).toBe(TOTAL);
  });

  it('re-running a page never resets an item already marked done', async () => {
    await enumerateStep(db, fakeApi(), 'j');
    await db.items.update(['j', 0], { status: 'done' });
    // simulate a crash after commit but before the caller noticed: rewind the cursor
    const job = await db.jobs.get('j');
    job.cursors['Category:T'] = { done: false };
    await db.jobs.put(job);
    await enumerateStep(db, fakeApi(), 'j');
    expect((await db.items.get(['j', 0])).status).toBe('done');
    expect(await db.items.count()).toBe(10);
  });

  it('writes the metadata shard BEFORE commit; a crash in the hook commits nothing and the retry rewrites it', async () => {
    const written = [];
    await expect(
      enumerateStep(db, fakeApi(), 'j', async () => {
        throw new Error('disk full');
      }),
    ).rejects.toThrow('disk full');
    expect(await db.items.count()).toBe(0);
    expect((await db.jobs.get('j')).cursors['Category:T']).toBeUndefined();
    await enumerateStep(db, fakeApi(), 'j', async (rows, n) => {
      written.push(n, rows.length);
    });
    expect(written).toEqual([1, 10]);
    expect(await db.items.count()).toBe(10);
  });

  it('assigns stable seq and page numbers across pages', async () => {
    await runEnumeration(db, fakeApi(), 'j');
    const seqs = (await db.items.toArray()).map((i) => i.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: TOTAL }, (_, i) => i));
    expect((await db.items.get(['j', 24])).pageid).toBe(1024);
    expect((await db.jobs.get('j')).pageCount).toBe(3);
  });

  it('requests only the wanted imageinfo fields and keeps only the wanted extmetadata keys', async () => {
    const seen = [];
    const api = fakeApi();
    await enumerateStep(db, async (p) => (seen.push(p), api(p)), 'j');
    const info = seen.find((p) => p.prop === 'imageinfo');
    expect(info.iiprop).toBe('url|size|sha1|user|extmetadata');
    expect(info.iiextmetadatafilter).toBe('DateTime|DateTimeOriginal|LicenseShortName|AttributionRequired|LicenseUrl|License');
    const row = await db.items.get(['j', 0]);
    expect(row).toMatchObject({ descriptionurl: 'https://c/d', descriptionshorturl: 'https://c/s', meta: { LicenseShortName: 'CC0' } });
    expect(row.meta).not.toHaveProperty('Artist');
  });
});
