// Receives a release built by GitHub Actions and swaps it in. Disabled unless DEPLOY_SECRET is set.
// Security model: the upload is authenticated with an HMAC of (timestamp + body) using a shared secret,
// timestamps expire after 5 minutes (replay), the archive is listed and validated BEFORE extraction
// (only dist/ and server/, no symlinks, no absolute or ".." paths), and only one deploy runs at a time.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_AGE_MS = 5 * 60 * 1000;
export const MAX_BODY_BYTES = 25 * 1024 * 1024;
export const MIN_SECRET_LENGTH = 32;
const ALLOWED_TOP_LEVEL = new Set(['dist', 'server']);
const REQUIRED_FILES = ['dist/index.html', 'server/index.mjs'];

/** HMAC-SHA256 over `${timestamp}.` followed by the raw body bytes. Returns lowercase hex. */
export function sign(secret, timestamp, body) {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

/** @returns {{ok: boolean, reason?: string}} `reason` is for our logs only, never sent to the caller. */
export function verifyRequest({ secret, timestamp, signature, body, now = Date.now() }) {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: 'deploy disabled (secret missing or too short)' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_MS) return { ok: false, reason: 'timestamp missing or expired' };
  const given = String(signature ?? '').replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/.test(given)) return { ok: false, reason: 'malformed signature' };
  const expected = sign(secret, timestamp, body);
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex')) ? { ok: true } : { ok: false, reason: 'bad signature' };
}

/** Validate the output of `tar -tvzf` (GNU format) before anything is extracted. */
export function checkEntries(listing) {
  const lines = listing.split('\n').filter(Boolean);
  const names = [];
  for (const line of lines) {
    const m = line.match(/^(.)\S+\s+\S+\s+\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+(.+)$/);
    if (!m) return { ok: false, reason: `unreadable entry: ${line.slice(0, 60)}` };
    const [, type, rawName] = m;
    const name = rawName.replace(/^\.\//, '');
    if (type !== '-' && type !== 'd') return { ok: false, reason: `unsupported entry type "${type}": ${name}` };
    if (name.startsWith('/') || name.split('/').includes('..')) return { ok: false, reason: `unsafe path: ${name}` };
    if (!ALLOWED_TOP_LEVEL.has(name.split('/')[0])) return { ok: false, reason: `unexpected top-level entry: ${name}` };
    names.push(name.replace(/\/$/, ''));
  }
  for (const f of REQUIRED_FILES) if (!names.includes(f)) return { ok: false, reason: `release is missing ${f}` };
  return { ok: true };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}: ${err.trim().slice(0, 300)}`))));
  });
}

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

/**
 * Validate, extract and swap in a release. The previous dist/ and server/ are kept in .deploy/prev
 * for a manual rollback. Throws (leaving the running app untouched) if anything is wrong.
 */
export async function installRelease(appRoot, tgz) {
  const work = join(appRoot, '.deploy');
  const next = join(work, 'next');
  const prev = join(work, 'prev');
  const archive = join(work, 'release.tgz');
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  await writeFile(archive, tgz);

  const verdict = checkEntries(await run('tar', ['-tvzf', archive]));
  if (!verdict.ok) throw new Error(`rejected release: ${verdict.reason}`);
  await run('tar', ['-xzf', archive, '-C', next, '--no-same-owner', '--no-same-permissions']);
  for (const f of REQUIRED_FILES) if (!(await exists(join(next, f)))) throw new Error(`release is missing ${f}`);

  await rm(prev, { recursive: true, force: true });
  await mkdir(prev, { recursive: true });
  const swapped = [];
  try {
    for (const name of ALLOWED_TOP_LEVEL) {
      if (await exists(join(appRoot, name))) await rename(join(appRoot, name), join(prev, name));
      swapped.push(name);
      await rename(join(next, name), join(appRoot, name));
    }
  } catch (e) {
    // Put back whatever was moved so the app keeps working.
    for (const name of swapped) {
      await rm(join(appRoot, name), { recursive: true, force: true }).catch(() => {});
      if (await exists(join(prev, name))) await rename(join(prev, name), join(appRoot, name)).catch(() => {});
    }
    throw e;
  }
  await rm(archive, { force: true });
}
