import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LANGUAGES, detectLocale, locale, setLocale, t } from '../src/i18n';

const dir = new URL('../src/i18n/', import.meta.url);
const load = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, dir), 'utf8'));
const messages = (code) => Object.entries(load(code)).filter(([k]) => k !== '@metadata');
const params = (s) => [...new Set(s.match(/\$\d/g) ?? [])].sort();

describe('message files', () => {
  const en = Object.fromEntries(messages('en'));

  it('has a file for every offered language, and qqq documents every message', () => {
    const files = readdirSync(dir).filter((f) => /^[a-z]{2,3}\.json$/.test(f));
    expect(files.map((f) => f.slice(0, -5)).sort()).toEqual([...LANGUAGES.map((l) => l.code), 'qqq'].sort());
    expect(Object.keys(Object.fromEntries(messages('qqq'))).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(LANGUAGES.map((l) => l.code))('%s has every message, using the same $n parameters as English', (code) => {
    const own = Object.fromEntries(messages(code));
    expect(Object.keys(own).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(own)) {
      // A language without plural forms may leave out the parameter that only selects the form
      expect(
        params(text).every((p) => params(en[key]).includes(p)),
        key,
      ).toBe(true);
    }
  });
});

describe('t()', () => {
  beforeEach(() => setLocale('en', { save: false }));

  it('fills parameters and plurals', () => {
    expect(t('cd-row-files', 1, '1')).toBe('1 file');
    expect(t('cd-row-files', 2, '2')).toBe('2 files');
  });
  it('follows the language, with the right plural forms', () => {
    setLocale('uk', { save: false });
    expect(locale.value).toBe('uk');
    expect([1, 2, 5].map((n) => t('cd-row-files', n, String(n)))).toEqual(['1 файл', '2 файли', '5 файлів']);
    setLocale('ar', { save: false });
    expect([0, 1, 2, 3, 11, 100].map((n) => t('cd-row-files', n, String(n)))).toEqual([
      'لا ملفات',
      'ملف واحد',
      'ملفان',
      '3 ملفات',
      '11 ملفًا',
      '100 ملف',
    ]);
  });
  it('falls back to English for an unknown language', () => {
    setLocale('xx', { save: false });
    expect(locale.value).toBe('en');
  });
});

describe('detectLocale', () => {
  it('reads ?uselang= and ignores unsupported languages', () => {
    expect(detectLocale('?uselang=fr')).toBe('fr');
    expect(detectLocale('?uselang=klingon')).toBe('en');
    expect(detectLocale('')).toBe('en');
  });
});
