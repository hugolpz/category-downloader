import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_AGE_MS, checkEntries, installRelease, sign, verifyRequest } from '../server/deploy.mjs';

const SECRET = 'x'.repeat(40);
const body = Buffer.from('release bytes');
const now = 1_800_000_000_000;

describe('verifyRequest', () => {
  const good = () => ({ secret: SECRET, timestamp: String(now), signature: `sha256=${sign(SECRET, String(now), body)}`, body, now });
  it('accepts a correctly signed, fresh request', () => {
    expect(verifyRequest(good())).toEqual({ ok: true });
  });
  it('refuses a wrong secret, a tampered body and a malformed signature', () => {
    expect(verifyRequest({ ...good(), secret: 'y'.repeat(40) }).ok).toBe(false);
    expect(verifyRequest({ ...good(), body: Buffer.from('other') }).ok).toBe(false);
    expect(verifyRequest({ ...good(), signature: 'sha256=nothex' }).ok).toBe(false);
    expect(verifyRequest({ ...good(), signature: undefined }).ok).toBe(false);
  });
  it('refuses old or future timestamps (replay) and a missing timestamp', () => {
    const stale = String(now - MAX_AGE_MS - 1);
    expect(verifyRequest({ ...good(), timestamp: stale, signature: sign(SECRET, stale, body) }).ok).toBe(false);
    expect(verifyRequest({ ...good(), timestamp: undefined }).ok).toBe(false);
  });
  it('is disabled without a long enough secret', () => {
    expect(verifyRequest({ ...good(), secret: undefined }).ok).toBe(false);
    expect(verifyRequest({ ...good(), secret: 'short', signature: sign('short', String(now), body) }).ok).toBe(false);
  });
});

const line = (name, type = '-') => `${type}rw-r--r-- runner/runner 120 2026-10-15 12:00 ${name}`;
const okListing = [
  line('dist/', 'd'),
  line('dist/index.html'),
  line('dist/assets/a.js'),
  line('server/', 'd'),
  line('server/index.mjs'),
].join('\n');

describe('checkEntries', () => {
  it('accepts a normal release', () => {
    expect(checkEntries(okListing)).toEqual({ ok: true });
  });
  it.each([
    ['absolute path', line('/etc/passwd')],
    ['parent traversal', line('dist/../../evil')],
    ['unknown top-level folder', line('node_modules/x.js')],
    ['symlink', line('dist/link', 'l')],
    ['hard link', line('dist/h', 'h')],
  ])('rejects %s', (_label, bad) => {
    expect(checkEntries(`${okListing}\n${bad}`).ok).toBe(false);
  });
  it('rejects a release without the app entry points', () => {
    expect(checkEntries([line('dist/', 'd'), line('dist/index.html')].join('\n')).ok).toBe(false);
  });
});

const tarAvailable = spawnSync('tar', ['--version']).status === 0;

describe.skipIf(!tarAvailable)('installRelease (real tar)', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'cf-deploy-'));
  const write = (root, rel, text) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  const pack = (srcRoot, args) => {
    const out = join(tmp(), 'r.tgz');
    const r = spawnSync('tar', ['-czf', out, ...args], { cwd: srcRoot });
    expect(r.status).toBe(0);
    return readFileSync(out);
  };

  it('swaps dist/ and server/, keeps the previous ones and leaves other files alone', async () => {
    const app = tmp();
    write(app, 'dist/index.html', 'OLD');
    write(app, 'server/index.mjs', 'OLD SERVER');
    write(app, '.env', 'SECRET=keep-me');
    const src = tmp();
    write(src, 'dist/index.html', 'NEW');
    write(src, 'dist/version.json', '{"sha":"abc"}');
    write(src, 'server/index.mjs', 'NEW SERVER');

    await installRelease(app, pack(src, ['dist', 'server']));

    expect(readFileSync(join(app, 'dist/index.html'), 'utf8')).toBe('NEW');
    expect(readFileSync(join(app, 'server/index.mjs'), 'utf8')).toBe('NEW SERVER');
    expect(readFileSync(join(app, '.deploy/prev/dist/index.html'), 'utf8')).toBe('OLD');
    expect(readFileSync(join(app, '.env'), 'utf8')).toBe('SECRET=keep-me');
  });

  it('works on a first install with nothing to replace', async () => {
    const app = tmp();
    const src = tmp();
    write(src, 'dist/index.html', 'NEW');
    write(src, 'server/index.mjs', 'NEW SERVER');
    await installRelease(app, pack(src, ['dist', 'server']));
    expect(readFileSync(join(app, 'dist/index.html'), 'utf8')).toBe('NEW');
  });

  it('refuses an archive with absolute paths and changes nothing', async () => {
    const app = tmp();
    write(app, 'dist/index.html', 'OLD');
    write(app, 'server/index.mjs', 'OLD SERVER');
    const evilDir = tmp();
    write(evilDir, 'pwned.txt', 'x');
    const evil = pack('/', ['-P', join(evilDir, 'pwned.txt')]);
    await expect(installRelease(app, evil)).rejects.toThrow(/rejected release/);
    expect(readFileSync(join(app, 'dist/index.html'), 'utf8')).toBe('OLD');
  });

  it('refuses an archive containing a symlink', async () => {
    const app = tmp();
    const src = tmp();
    write(src, 'dist/index.html', 'NEW');
    write(src, 'server/index.mjs', 'NEW SERVER');
    symlinkSync('/etc', join(src, 'dist/etc-link'));
    await expect(installRelease(app, pack(src, ['dist', 'server']))).rejects.toThrow(/unsupported entry type/);
    expect(existsSync(join(app, 'dist'))).toBe(false);
  });

  it('refuses garbage that is not a tarball', async () => {
    await expect(installRelease(tmp(), Buffer.from('not a tarball'))).rejects.toThrow();
  });
});
