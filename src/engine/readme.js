import { EXTMETADATA_KEYS, IIPROP } from './enumerator';
import { jobRoot } from '../utils/categoryPath';

// The wording lives in a plain Markdown file so it can be edited without touching code.
import template from './readme.template.md?raw';

const STATUS = {
  running: 'in progress',
  done: 'complete',
  stopped: 'paused (can be resumed)',
  'paused-auth': 'paused: login expired (can be resumed)',
  error: 'stopped by an error (can be resumed)',
};

const API_URL = 'https://commons.wikimedia.org/w/api.php';
const MAX_FAILED_LISTED = 100;
const num = (n) => n.toLocaleString('en');
const wikiUrl = (category) => `https://commons.wikimedia.org/wiki/${encodeURI(category.replace(/ /g, '_'))}`;

/**
 * Tiny template engine: `{{name}}`, `{{#if flag}}…{{else}}…{{/if}}` (no nesting).
 * Unknown names are left untouched so a typo in the template is visible, never fatal.
 */
export function renderTemplate(tpl, values, flags) {
  const text = tpl
    .replace(/<!--[\s\S]*?-->\n?/, '') // drop the editing instructions
    .replace(/\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_m, flag, yes, no = '') => (flags[flag] ? yes : no))
    .replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
  return text.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function buildReadme({ job, phase, counts, failed, now }) {
  const root = jobRoot(job);
  const subs = job.categories.filter((c) => c !== root);
  const listed = counts.done + counts.failed + counts.pending;
  const hidden = counts.failed - MAX_FAILED_LISTED;
  const failedLines = failed
    .slice(0, MAX_FAILED_LISTED)
    .map((f) => `- ${f.title.replace(/^File:/, '')} — ${f.lastError ?? 'unknown error'}`);
  if (hidden > 0) failedLines.push(`- … and ${num(hidden)} more`);

  const values = {
    name: root.replace(/^Category:/, ''),
    status: STATUS[phase],
    downloaded: num(counts.done),
    listed: num(listed),
    failed_count: num(counts.failed),
    started: new Date(job.startedAt).toISOString(),
    updated: now.toISOString(),
    source_url: wikiUrl(root),
    folder: job.folder ?? '(the folder you picked)',
    page_size: String(job.pageSize),
    batch_size: String(job.imageinfoBatch),
    iiprop: IIPROP,
    extmetadata_filter: EXTMETADATA_KEYS.join('|'),
    category_param: encodeURIComponent(root).replace(/%3A/g, ':'),
    api_url: API_URL,
    subcategory_count: String(subs.length),
    subcategory_list: subs.map((s) => `  - <${wikiUrl(s)}>`).join('\n'),
    failed_list: failedLines.join('\n'),
  };
  const flags = {
    has_subcategories: subs.length > 0,
    root_excluded: !job.categories.includes(root),
    has_failed: counts.failed > 0,
    listing_unfinished: !job.enumDone,
    not_done: phase !== 'done',
  };
  return renderTemplate(template, values, flags);
}

export async function writeReadme(db, sink, jobId, phase) {
  const job = await db.jobs.get(jobId);
  if (!job) return '';
  const c = await db.counters.get(jobId);
  const done = c?.done ?? 0;
  const failed = c?.failed ?? 0;
  const failedRows = await db.failures.where('[jobId+seq]').between([jobId, 0], [jobId, Infinity]).limit(MAX_FAILED_LISTED).toArray();
  const text = buildReadme({
    job,
    phase,
    counts: { done, failed, pending: Math.max(0, job.enumerated - done - failed) },
    failed: failedRows,
    now: new Date(),
  });
  await sink.writeText(['README.md'], text);
  return text;
}
