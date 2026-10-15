import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter, routes } from '../src/router';
import { categoryLocation } from '../src/utils/categoryPath';

// Real route table, but with a stub component so navigating does not load the Vue views.
const Stub = { render: () => null };
const routeTable = routes.map((r) => ({ ...r, component: Stub }));
const make = (deps = {}) => createAppRouter({ history: createMemoryHistory(), routeTable, deps });

describe('routes', () => {
  const router = make();
  it('resolves the start page, a category page and unknown paths', () => {
    expect(router.resolve('/').name).toBe('home');
    const c = router.resolve('/Category:Lingua_Libre_pronunciation-sru');
    expect(c.name).toBe('category');
    expect(c.params.category).toBe('Category:Lingua_Libre_pronunciation-sru');
    expect(router.resolve('/a/b/c').name).toBe('not-found');
    expect(router.resolve('/Category:').name).toBe('not-found'); // no title
    expect(router.resolve('/Categories').name).toBe('not-found');
    expect(router.resolve('/job/12').name).toBe('not-found'); // the old shape is gone
  });

  it('accepts the awkward titles Commons allows: parentheses, slashes, percent signs, accents, any case of the prefix', () => {
    expect(router.resolve('/Category:Lingua_Libre_pronunciation-other_(Q36759)').params.category).toBe(
      'Category:Lingua_Libre_pronunciation-other_(Q36759)',
    );
    expect(router.resolve('/Category:Foo/Bar').params.category).toBe('Category:Foo/Bar');
    expect(router.resolve('/Category:100%25_pure').params.category).toBe('Category:100%_pure');
    expect(router.resolve('/Category:%C3%89t%C3%A9').params.category).toBe('Category:Été');
    expect(router.resolve('/category:foo').name).toBe('category');
  });

  it('builds the URLs the app links to', () => {
    expect(router.resolve(categoryLocation('Category:Lingua Libre pronunciation-sru')).href).toBe(
      '/Category:Lingua_Libre_pronunciation-sru',
    );
    expect(router.resolve(categoryLocation('category:Foo bar')).href).toBe('/Category:Foo_bar');
    expect(router.resolve(categoryLocation('Foo')).href).toBe('/Category:Foo'); // prefix added when missing
    expect(router.resolve({ name: 'home', query: { cats: 'A|B' } }).href).toBe('/?cats=A|B');
    expect(router.resolve({ name: 'home' }).href).toBe('/');
  });

  it('keeps the options in the query on the start page', async () => {
    const r = make();
    await r.push('/?cats=Category:A|Category:B&delay=500');
    expect(r.currentRoute.value.name).toBe('home');
    expect(r.currentRoute.value.query).toEqual({ cats: 'Category:A|Category:B', delay: '500' });
  });
});

describe('old /?category=… links', () => {
  it('redirect to /Category:… and keep the other options', async () => {
    const r = make();
    await r.push('/?category=Lingua_Libre_pronunciation-sru&delay=500');
    expect(r.currentRoute.value.name).toBe('category');
    expect(r.currentRoute.value.path).toBe('/Category:Lingua_Libre_pronunciation-sru');
    expect(r.currentRoute.value.query).toEqual({ delay: '500' });
  });
  it('accept any spelling of the title', async () => {
    const r = make();
    await r.push('/?category=Lingua Libre pronunciation-sru');
    expect(r.currentRoute.value.path).toBe('/Category:Lingua_Libre_pronunciation-sru');
  });
  it('an empty ?category= just stays on the start page', async () => {
    const r = make();
    await r.push('/?category=');
    expect(r.currentRoute.value.name).toBe('home');
  });
});

describe('login callback guard', () => {
  it('finishes the login on the callback path and redirects to the page the user was on', async () => {
    const completeLogin = vi.fn().mockResolvedValue('/Category:Foo_bar?x=1');
    const r = make({ pendingLogin: () => true, completeLogin });
    await r.push('/oauth/wikimedia/success?code=abc&state=s');
    expect(completeLogin).toHaveBeenCalledTimes(1);
    expect(completeLogin).toHaveBeenCalledWith('code=abc&state=s');
    expect(r.currentRoute.value.fullPath).toBe('/Category:Foo_bar?x=1');
    expect(r.currentRoute.value.name).toBe('category');
  });

  it('also works when the registered callback is the site root', async () => {
    const completeLogin = vi.fn().mockResolvedValue('/Category:Foo_bar');
    const r = make({ pendingLogin: () => true, completeLogin });
    await r.push('/?code=abc&state=s');
    expect(r.currentRoute.value.fullPath).toBe('/Category:Foo_bar');
  });

  it('ignores a stale ?code= when no login of ours is pending', async () => {
    const completeLogin = vi.fn();
    const r = make({ pendingLogin: () => false, completeLogin });
    await r.push('/?code=abc&state=s');
    expect(completeLogin).not.toHaveBeenCalled();
    expect(r.currentRoute.value.name).toBe('home');
  });

  it('does not run on normal navigation', async () => {
    const completeLogin = vi.fn();
    const r = make({ pendingLogin: () => true, completeLogin });
    await r.push('/Category:Foo_bar');
    expect(completeLogin).not.toHaveBeenCalled();
  });
});
