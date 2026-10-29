import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

vi.mock('../src/api/commons', async (importOriginal) => ({ ...(await importOriginal()), apiGet: vi.fn() }));

import { apiGet } from '../src/api/commons';
import { MIN_SEARCH_LENGTH, searchTerm, suggestCategories, toMenuItem } from '../src/api/suggestions';
import { useCategorySuggestions } from '../src/composables/useCategorySuggestions';

describe('searchTerm', () => {
  it('drops the Category: prefix (any case), turns underscores into spaces and trims', () => {
    expect(searchTerm('Category:Lingua_Libre_pron')).toBe('Lingua Libre pron');
    expect(searchTerm('  category:Foo bar ')).toBe('Foo bar');
    expect(searchTerm('Lingua')).toBe('Lingua');
    expect(searchTerm(undefined)).toBe('');
  });
});

describe('suggestCategories', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({ batchcomplete: '' }); // default: no match
  });

  it('makes no call below 5 characters of the name, however long the prefix is, and calls from exactly 5', async () => {
    expect(MIN_SEARCH_LENGTH).toBe(5);
    expect(await suggestCategories('Ling', 't')).toEqual([]);
    expect(await suggestCategories('Category:Ling', 't')).toEqual([]);
    expect(await suggestCategories('', 't')).toEqual([]);
    const callsBefore = apiGet.mock.calls.length;
    await suggestCategories('Lingu', 't');
    expect(apiGet.mock.calls.length).toBe(callsBefore + 1);
  });

  it('asks for category-namespace prefix matches with their counts, in ONE call', async () => {
    apiGet.mockResolvedValue({ query: { pages: [] } });
    const signal = new AbortController().signal;
    await suggestCategories('Category:Lingua_Libre_pron', 'tok', { signal, limit: 5 });
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith(
      {
        action: 'query',
        generator: 'prefixsearch',
        gpssearch: 'Lingua Libre pron',
        gpsnamespace: '14',
        gpslimit: '5',
        prop: 'categoryinfo',
      },
      'tok',
      { signal, wiki: 'commons.wikimedia.org' },
    );
  });

  it('asks the wiki named by a prefix, and names results with it', async () => {
    apiGet.mockResolvedValue({ query: { pages: [{ title: 'Catégorie:Guatemala', index: 1, categoryinfo: { files: 2, subcats: 0 } }] } });
    const found = await suggestCategories('fr:wp:Category:Guatemala', 'tok');
    expect(apiGet.mock.calls[0][2].wiki).toBe('fr.wikipedia.org');
    expect(apiGet.mock.calls[0][0].gpssearch).toBe('Guatemala');
    expect(found[0].title).toBe('fr:wp:Category:Guatemala');
  });

  it('returns the suggestions best match first (by `index`, not by the order of `pages`) with their counts', async () => {
    apiGet.mockResolvedValue({
      query: {
        pages: [
          { title: 'Category:Lingua Libre pronunciation-srr', index: 7, categoryinfo: { files: 1, subcats: 0 } },
          { title: 'Category:Lingua Libre pronunciation-smw', index: 1, categoryinfo: { files: 18, subcats: 0 } },
          { title: 'Category:Lingua Libre pronunciation-slk', index: 2 }, // categoryinfo missing: an empty category
        ],
      },
    });
    expect(await suggestCategories('Lingua Libre', 't')).toEqual([
      { title: 'Category:Lingua Libre pronunciation-smw', files: 18, subcats: 0 },
      { title: 'Category:Lingua Libre pronunciation-slk', files: 0, subcats: 0 },
      { title: 'Category:Lingua Libre pronunciation-srr', files: 1, subcats: 0 },
    ]);
  });

  it('returns [] when nothing matches (the response then has no `query` at all)', async () => {
    apiGet.mockResolvedValue({ batchcomplete: '' });
    expect(await suggestCategories('zzzzqqqxx', 't')).toEqual([]);
  });
});

describe('toMenuItem', () => {
  it('uses the Commons URL spelling as value and label, with a readable count', () => {
    expect(toMenuItem({ title: 'Category:Lingua Libre pronunciation-sru', files: 3405, subcats: 0 })).toEqual({
      value: 'Category:Lingua_Libre_pronunciation-sru',
      label: 'Category:Lingua_Libre_pronunciation-sru',
      description: '3,405 files',
    });
  });
  it('says "1 file", "0 files", and mentions subcategories only when there are no files', () => {
    expect(toMenuItem({ title: 'Category:A b', files: 1, subcats: 0 }).description).toBe('1 file');
    expect(toMenuItem({ title: 'Category:A b', files: 0, subcats: 0 }).description).toBe('0 files');
    expect(toMenuItem({ title: 'Category:A b', files: 0, subcats: 12 }).description).toBe('no files, 12 subcategories');
    expect(toMenuItem({ title: 'Category:A b', files: 0, subcats: 1 }).description).toBe('no files, 1 subcategory');
    expect(toMenuItem({ title: 'Category:A b', files: 5, subcats: 12 }).description).toBe('5 files');
  });
});

describe('useCategorySuggestions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (search) => {
    const scope = effectScope();
    const s = scope.run(() => useCategorySuggestions({ search, delayMs: 300 }));
    return { s, scope };
  };

  it('does nothing until 5 characters are typed', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { s, scope } = make(search);
    s.onInput('Ling');
    await vi.advanceTimersByTimeAsync(1000);
    expect(search).not.toHaveBeenCalled();
    expect(s.pending.value).toBe(false);
    scope.stop();
  });

  it('waits for a pause in typing, then searches once with the latest text', async () => {
    const search = vi.fn().mockResolvedValue([{ title: 'Category:Lingua' }]);
    const { s, scope } = make(search);
    s.onInput('Lingu');
    await vi.advanceTimersByTimeAsync(200);
    s.onInput('Lingua');
    await vi.advanceTimersByTimeAsync(299);
    expect(search).not.toHaveBeenCalled();
    expect(s.pending.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe('Lingua');
    expect(s.items.value).toEqual([{ title: 'Category:Lingua' }]);
    expect(s.searched.value).toBe(true);
    expect(s.pending.value).toBe(false);
    scope.stop();
  });

  it('ignores a slow answer that arrives after a newer search', async () => {
    let resolveOld;
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce([{ title: 'NEW' }]);
    const { s, scope } = make(search);
    s.onInput('Lingua');
    await vi.advanceTimersByTimeAsync(300); // first search in flight
    s.onInput('Lingua Libre');
    await vi.advanceTimersByTimeAsync(300);
    expect(s.items.value).toEqual([{ title: 'NEW' }]);
    resolveOld([{ title: 'OLD' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.items.value).toEqual([{ title: 'NEW' }]); // the old answer did not overwrite it
    scope.stop();
  });

  it('cancels the previous request when the user types again', async () => {
    const signals = [];
    const search = vi.fn((_t, signal) => (signals.push(signal), new Promise(() => {})));
    const { s, scope } = make(search);
    s.onInput('Lingua');
    await vi.advanceTimersByTimeAsync(300);
    s.onInput('Lingua Libre');
    expect(signals[0].aborted).toBe(true);
    scope.stop();
  });

  it('answers a repeated search from its cache, case-insensitively, with no new call', async () => {
    const search = vi.fn().mockResolvedValue([{ title: 'X' }]);
    const { s, scope } = make(search);
    s.onInput('Lingua');
    await vi.advanceTimersByTimeAsync(300);
    s.onInput('Lingua Libre');
    await vi.advanceTimersByTimeAsync(300);
    expect(search).toHaveBeenCalledTimes(2);
    s.onInput('LINGUA');
    expect(s.items.value).toEqual([{ title: 'X' }]);
    expect(s.searched.value).toBe(true);
    expect(search).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('clears the list when the text gets shorter than 5 characters', async () => {
    const search = vi.fn().mockResolvedValue([{ title: 'X' }]);
    const { s, scope } = make(search);
    s.onInput('Lingua');
    await vi.advanceTimersByTimeAsync(300);
    expect(s.items.value).toHaveLength(1);
    s.onInput('Ling');
    expect(s.items.value).toEqual([]);
    expect(s.searched.value).toBe(false);
    scope.stop();
  });

  it('turns any failure into "no suggestions", never an error', async () => {
    const search = vi.fn().mockRejectedValue(new Error('offline'));
    const { s, scope } = make(search);
    s.onInput('Lingua');
    await vi.advanceTimersByTimeAsync(300);
    expect(s.items.value).toEqual([]);
    expect(s.searched.value).toBe(false);
    expect(s.pending.value).toBe(false);
    scope.stop();
  });

  it('stops its timer and cancels the request when its component goes away', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { s, scope } = make(search);
    s.onInput('Lingua');
    scope.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(search).not.toHaveBeenCalled();
  });
});
