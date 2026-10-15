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
    setup.applyQuery({ subcats: 'Category:A|Category:B', delay: '500', concurrency: '2' });
    expect(setup.form).toMatchObject({ category: 'Category:Foo', subcats: ['Category:A', 'Category:B'], delayMs: 500, concurrency: 2 });
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
