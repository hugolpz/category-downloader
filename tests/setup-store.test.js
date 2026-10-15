import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory } from 'vue-router';

// A router on in-memory history with stub components, standing in for the browser's.
vi.mock('../src/router', async (importOriginal) => {
  const mod = await importOriginal();
  const Stub = { render: () => null };
  const router = mod.createAppRouter({ history: createMemoryHistory(), routeTable: mod.routes.map((r) => ({ ...r, component: Stub })) });
  return { ...mod, appRouter: () => router };
});
vi.mock('../src/api/commons', async (importOriginal) => ({
  ...(await importOriginal()),
  categoryInfo: vi.fn(async (titles) => new Map(titles.map((t) => [t, { exists: !t.includes('Nope'), files: 7, subcats: 0 }]))),
  listSubcategories: vi.fn(async () => []),
}));

import { appRouter } from '../src/router';
import { useAuthStore } from '../src/stores/auth';
import { useSetupStore } from '../src/stores/setup';

beforeEach(async () => {
  vi.stubGlobal('location', { origin: 'https://commons-flow.test', search: '' });
  setActivePinia(createPinia());
  await appRouter().push('/');
});

describe('setup store: address ↔ form', () => {
  it('setCategory fills the field from the URL and drops what was checked for the previous category', () => {
    const setup = useSetupStore();
    setup.rootInfo = { exists: true, files: 3 };
    expect(setup.setCategory('Category:Lingua_Libre_pronunciation-sru')).toBe(true);
    expect(setup.form.category).toBe('Category:Lingua_Libre_pronunciation-sru');
    expect(setup.rootInfo).toBeNull();
  });

  it('setCategory leaves everything alone when it is the same category in another spelling', () => {
    const setup = useSetupStore();
    setup.setCategory('Category:Foo_bar');
    setup.rootInfo = { exists: true, files: 3 };
    expect(setup.setCategory('category:Foo bar')).toBe(false);
    expect(setup.rootInfo).not.toBeNull();
  });

  it('applyQuery sets the options but never touches the category', () => {
    const setup = useSetupStore();
    setup.setCategory('Category:Foo');
    setup.applyQuery({ cats: 'Category:Foo|Category:Foo/B', delay: '500', concurrency: '2' });
    expect(setup.form).toMatchObject({ category: 'Category:Foo', cats: ['Category:Foo', 'Category:Foo/B'], delayMs: 500, concurrency: 2 });
    expect(setup.includeSubcats).toBe(true);
  });

  it('shareUrl is /Category:… plus only the non-default options', () => {
    const setup = useSetupStore();
    expect(setup.shareUrl).toBe('https://commons-flow.test/');
    setup.setCategory('Category:Lingua Libre pronunciation-sru');
    expect(setup.shareUrl).toBe('https://commons-flow.test/Category:Lingua_Libre_pronunciation-sru');
    setup.form.delayMs = 500;
    expect(setup.shareUrl).toBe('https://commons-flow.test/Category:Lingua_Libre_pronunciation-sru?delay=500');
    expect(setup.shareUrl).not.toContain('?category=');
  });

  it('a successful Check moves the address to /Category:…', async () => {
    const auth = useAuthStore();
    auth.token = 'token';
    const setup = useSetupStore();
    setup.form.category = 'Lingua Libre pronunciation-sru'; // typed, no prefix, spaces
    await setup.check();
    expect(setup.rootInfo.files).toBe(7);
    await vi.waitFor(() => expect(appRouter().currentRoute.value.path).toBe('/Category:Lingua_Libre_pronunciation-sru'));
  });

  it('a failed Check leaves the address alone and reports the error', async () => {
    const auth = useAuthStore();
    auth.token = 'token';
    const setup = useSetupStore();
    setup.form.category = 'Nope';
    await setup.check();
    expect(setup.error).toMatch(/does not exist/);
    expect(appRouter().currentRoute.value.path).toBe('/');
  });

  it('typing in the field does NOT change the address until Check', async () => {
    const setup = useSetupStore();
    setup.form.category = 'Category:Half typed';
    await nextTick();
    expect(appRouter().currentRoute.value.path).toBe('/');
  });

  it('changing an option updates the query but keeps the path', async () => {
    await appRouter().push('/Category:Foo_bar');
    const setup = useSetupStore();
    setup.form.delayMs = 700;
    await vi.waitFor(() => expect(appRouter().currentRoute.value.query).toEqual({ delay: '700' }));
    expect(appRouter().currentRoute.value.path).toBe('/Category:Foo_bar');
  });
});

describe('setup store: which categories are downloaded (the top one can be left out)', () => {
  const checked = async (
    category = 'Category:Foo',
    subs = [
      { title: 'Category:Foo/A', files: 10, subcats: 0 },
      { title: 'Category:Foo/B', files: 5, subcats: 0 },
    ],
  ) => {
    const { listSubcategories } = await import('../src/api/commons');
    listSubcategories.mockResolvedValue(subs);
    useAuthStore().token = 'token';
    const setup = useSetupStore();
    setup.form.category = category;
    return setup;
  };

  it('by default (no selection) only the top category is downloaded', async () => {
    const setup = await checked();
    await setup.check();
    expect(setup.form.cats).toBeNull();
    expect(setup.includeSubcats).toBe(false);
    expect(setup.selectedCategories).toEqual(['Category:Foo']);
    expect(setup.approxTotal).toBe(7);
    expect(setup.canStart).toBe(true);
  });

  it('ticking "include subcategories" starts with the top category selected and lists it first in the table', async () => {
    const setup = await checked();
    await setup.check();
    setup.includeSubcats = true;
    await vi.waitFor(() => expect(setup.subcategories).toHaveLength(2));
    expect(setup.form.cats).toEqual(['Category:Foo']);
    expect(setup.selectionRows.map((r) => [r.title, r.isTop, r.files])).toEqual([
      ['Category:Foo', true, 7],
      ['Category:Foo/A', false, 10],
      ['Category:Foo/B', false, 5],
    ]);
  });

  it("the top category's files are downloaded only while its own title is selected", async () => {
    const setup = await checked();
    await setup.check();
    setup.includeSubcats = true;
    await vi.waitFor(() => expect(setup.subcategories).toHaveLength(2));
    setup.form.cats = ['Category:Foo', 'Category:Foo/B'];
    expect(setup.selectedCategories).toEqual(['Category:Foo', 'Category:Foo/B']);
    expect(setup.approxTotal).toBe(12);
    setup.form.cats = ['Category:Foo/A', 'Category:Foo/B']; // top category unticked: its 7 files are out
    expect(setup.selectedCategories).toEqual(['Category:Foo/A', 'Category:Foo/B']);
    expect(setup.approxTotal).toBe(15);
    expect(setup.canStart).toBe(true);
  });

  it('keeps table order whatever order the boxes were ticked in', async () => {
    const setup = await checked();
    await setup.check();
    setup.includeSubcats = true;
    await vi.waitFor(() => expect(setup.subcategories).toHaveLength(2));
    setup.form.cats = ['Category:Foo/B', 'Category:Foo', 'Category:Foo/A'];
    expect(setup.selectedCategories).toEqual(['Category:Foo', 'Category:Foo/A', 'Category:Foo/B']);
  });

  it('nothing selected means nothing to start', async () => {
    const setup = await checked();
    await setup.check();
    setup.includeSubcats = true;
    await vi.waitFor(() => expect(setup.subcategories).toHaveLength(2));
    setup.form.cats = [];
    expect(setup.selectedCategories).toEqual([]);
    expect(setup.canStart).toBe(false);
    expect(setup.approxTotal).toBe(0);
  });

  it('unticking "include subcategories" goes back to the default (just the top category)', async () => {
    const setup = await checked();
    await setup.check();
    setup.includeSubcats = true;
    await vi.waitFor(() => expect(setup.subcategories).toHaveLength(2));
    setup.form.cats = ['Category:Foo/A'];
    setup.includeSubcats = false;
    expect(setup.form.cats).toBeNull();
    expect(setup.selectedCategories).toEqual(['Category:Foo']);
  });

  it('a link with a selection (top category absent) is honoured after Check, and stale titles are dropped', async () => {
    const setup = await checked();
    setup.applyQuery({ cats: 'Category:Foo/A|Category:Not_a_child' });
    await setup.check();
    expect(setup.form.cats).toEqual(['Category:Foo/A']); // the top category was NOT listed: its files stay out
    expect(setup.selectedCategories).toEqual(['Category:Foo/A']);
    expect(setup.includeSubcats).toBe(true);
  });

  it('changing the top category resets the selection', () => {
    const setup = useSetupStore();
    setup.setCategory('Category:Foo');
    setup.form.cats = ['Category:Foo/A'];
    setup.setCategory('Category:Other');
    expect(setup.form.cats).toBeNull();
  });

  it('the share link carries the selection, including whether the top category is in it', () => {
    const setup = useSetupStore();
    setup.setCategory('Category:Foo bar');
    setup.form.cats = ['Category:Foo bar/A'];
    expect(setup.shareUrl).toBe('https://commons-flow.test/Category:Foo_bar?cats=Category:Foo_bar/A');
    setup.form.cats = ['Category:Foo bar', 'Category:Foo bar/A'];
    expect(setup.shareUrl).toBe('https://commons-flow.test/Category:Foo_bar?cats=Category:Foo_bar|Category:Foo_bar/A');
    setup.form.cats = null;
    expect(setup.shareUrl).toBe('https://commons-flow.test/Category:Foo_bar');
  });
});
