import { describe, expect, it } from 'vitest';
import { folderName, itemPath, safeName } from '../src/engine/paths';

describe('paths', () => {
  it('keeps clean names untouched', () => {
    expect(safeName('File:LL-Q150 (fra)-Yug-bonjour.wav', 1)).toBe('LL-Q150 (fra)-Yug-bonjour.wav');
  });
  it('sanitizes and disambiguates altered names with the pageid', () => {
    expect(safeName('File:a/b:c?.ogg', 42)).toBe('a_b_c_~42.ogg');
    expect(safeName('File:CON.wav', 7)).toBe('_CON~7.wav');
  });
  it('truncates long names by bytes, keeping the extension', () => {
    const n = safeName('File:' + 'é'.repeat(300) + '.ogg', 9);
    expect(new TextEncoder().encode(n).length).toBeLessThanOrEqual(255);
    expect(n.endsWith('~9.ogg')).toBe(true);
  });
  it('shards 1000 files per folder', () => {
    expect(itemPath({ seq: 0, title: 'File:a.ogg', pageid: 1 })[1]).toBe('0000');
    expect(itemPath({ seq: 1999, title: 'File:a.ogg', pageid: 1 })[1]).toBe('0001');
  });
  it('names the job folder after the category', () => {
    expect(folderName('Category:Lingua Libre pronunciation-fra')).toBe('Lingua Libre pronunciation-fra');
    expect(folderName('Category:A/B: C?')).toBe('A_B_ C_');
  });
});
