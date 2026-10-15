import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CommonsFlowDB } from '../src/engine/db';
import { buildReadme, renderTemplate, writeReadme } from '../src/engine/readme';
import { memorySink, mkItem, mkJob } from './helpers';

const job = mkJob({ categories: ['Category:Lingua Libre pronunciation-fra', 'Category:Sub A'], startedAt: Date.UTC(2026, 9, 15) });

describe('README', () => {
  it('summarises a finished job', () => {
    const t = buildReadme({ job, phase: 'done', counts: { done: 1200, failed: 0, pending: 0 }, failed: [], now: new Date(0) });
    expect(t).toContain('# Lingua Libre pronunciation-fra');
    expect(t).toContain('**Status:** complete');
    expect(t).toContain('1,200 of 1,200');
    expect(t).toContain('Category:Sub_A');
    expect(t).not.toContain('Resuming');
  });
  it("documents the API calls with the job's real parameters", () => {
    const t = buildReadme({
      job: { ...job, pageSize: 500, imageinfoBatch: 50 },
      phase: 'done',
      counts: { done: 1, failed: 0, pending: 0 },
      failed: [],
      now: new Date(0),
    });
    expect(t).toContain('list=categorymembers&cmtitle=Category:Lingua%20Libre%20pronunciation-fra&cmtype=file&cmsort=sortkey&cmlimit=500');
    expect(t).toContain('cmcontinue=<token>');
    expect(t).toContain('up to 50 page ids per call');
    expect(t).toContain(
      'iiprop=url|size|sha1|user|extmetadata&iiextmetadatafilter=DateTime|DateTimeOriginal|LicenseShortName|AttributionRequired|LicenseUrl|License\n',
    );
    expect(t).toContain('**Contributors must be credited**');
    expect(t).toContain('Each file has a `<file>.json` beside it');
  });
  it('lists failures and explains how to resume when not done', () => {
    const t = buildReadme({
      job,
      phase: 'stopped',
      counts: { done: 1, failed: 1, pending: 3 },
      failed: [{ title: 'File:x.wav', lastError: 'HTTP 404' }],
      now: new Date(0),
    });
    expect(t).toContain('x.wav — HTTP 404');
    expect(t).toContain('## Resuming');
  });
  it('writeReadme reads counts from the DB and writes README.md at the folder root', async () => {
    const db = new CommonsFlowDB(`t${Math.random()}`);
    await db.jobs.put({ ...job, enumerated: 3 });
    await db.counters.put({ jobId: 'j', done: 1, failed: 1, lowWater: 1, recent: [] });
    await db.failures.put(mkItem(1, { status: 'failed', lastError: 'HTTP 404' }));
    const { sink, files } = memorySink();
    const text = await writeReadme(db, sink, 'j', 'stopped');
    expect(files.get('README.md')).toBe(text);
    expect(text).toContain('**Downloaded:** 1 of 3');
    expect(text).toContain('1 failed');
  });
  it('leaves no unfilled placeholder or tag for any combination of options', () => {
    for (const phase of ['running', 'done', 'stopped']) {
      for (const failed of [0, 150]) {
        for (const enumDone of [true, false]) {
          const t = buildReadme({
            job: { ...job, enumDone },
            phase,
            counts: { done: 5, failed, pending: 2 },
            failed: Array.from({ length: Math.min(failed, 100) }, (_, i) => ({ title: `File:f${i}.wav`, lastError: 'HTTP 404' })),
            now: new Date(0),
          });
          expect(t).not.toMatch(/\{\{|\}\}|<!--/);
          expect(t).not.toMatch(/\n{3,}/);
        }
      }
    }
  });
  it('template engine: if/else, unknown names stay visible', () => {
    expect(renderTemplate('a {{#if x}}YES{{else}}NO{{/if}} {{who}} {{typo}}', { who: 'me' }, { x: false })).toBe('a NO me {{typo}}\n');
  });
});
