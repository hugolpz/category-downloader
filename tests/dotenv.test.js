import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv, parseDotEnv } from '../server/dotenv.mjs';

describe('parseDotEnv', () => {
  it('parses plain, quoted, exported and commented lines', () => {
    const env = parseDotEnv(['# comment', '', 'A=1', 'B = two ', 'export C="three words"', "D='four'", 'E=five # trailing', 'F=a=b', 'bad line'].join('\n'));
    expect(env).toEqual({ A: '1', B: 'two', C: 'three words', D: 'four', E: 'five', F: 'a=b' });
  });
  it('handles Windows line endings', () => {
    expect(parseDotEnv('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });
});

describe('loadDotEnv', () => {
  it('fills missing variables but never overrides real ones', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cf-')), '.env');
    writeFileSync(file, 'KEEP=from-file\nNEW=from-file\n');
    const env = { KEEP: 'from-env' };
    expect(loadDotEnv(file, env)).toBe(true);
    expect(env).toEqual({ KEEP: 'from-env', NEW: 'from-file' });
  });
  it('is fine when the file does not exist', () => {
    expect(loadDotEnv('/no/such/.env', {})).toBe(false);
  });
});
