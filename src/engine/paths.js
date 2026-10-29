const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_BYTES = 200; // well under the 255-byte limit of common filesystems
const enc = new TextEncoder();

function truncateBytes(s, max) {
  let out = '';
  for (const ch of s) {
    if (enc.encode(out + ch).length > max) break;
    out += ch;
  }
  return out;
}

/** Filesystem-safe name from a Commons title. If we had to alter it, `~pageid` keeps it unique. */
export function safeName(title, pageid) {
  const raw = title.replace(/^File:/, '');
  let name = raw
    // eslint-disable-next-line no-control-regex -- control characters are exactly what file names must not contain
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
    .replace(/^\.+/, '_');
  const dot = name.lastIndexOf('.');
  let base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  if (RESERVED.test(base)) base = `_${base}`;
  const room = MAX_BYTES - enc.encode(ext).length;
  const cut = truncateBytes(base, room);
  name = cut + ext;
  return name === raw ? name : `${cut}~${pageid}${ext}`;
}

/** files/0000/name.ext — 1,000 files per folder, in enumeration order. */
export function itemPath(item) {
  const shard = String(Math.floor(item.seq / 1000)).padStart(4, '0');
  return ['files', shard, safeName(item.title, item.pageid)];
}

export const sidecarPath = (item) => {
  const p = itemPath(item);
  return [...p.slice(0, -1), `${p[p.length - 1]}.json`];
};

export const metadataShardPath = (n) => ['metadata', `page-${String(n).padStart(6, '0')}.ndjson`];

/** Top-level folder for a job: the category name, made filesystem-safe. */
export function folderName(category) {
  const name = category
    .replace(/^Category:/, '')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what file names must not contain
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
    .replace(/^\.+/, '_')
    .trim();
  return truncateBytes(name, MAX_BYTES) || 'category-downloader';
}
