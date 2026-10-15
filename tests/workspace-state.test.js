import { describe, expect, it } from 'vitest';
import { downloadStepState } from '../src/views/workspaceState';

const base = { attached: 'missing', ready: true, openJobId: null, openCategory: null, category: 'Category:Foo_bar', running: false };

describe('downloadStepState: what step 3 (the download) of the single page shows', () => {
  it('shows the placeholder when nothing was downloaded here and nothing is open', () => {
    expect(downloadStepState(base)).toBe('none');
    expect(downloadStepState({ ...base, category: '' })).toBe('none'); // the start page, no category
  });

  it('REGRESSION: pressing Start on the page that shows the setup shows the dashboard, although the address (and so the lookup) never changed', () => {
    expect(downloadStepState(base)).toBe('none');
    expect(downloadStepState({ ...base, openJobId: '1792064469', openCategory: 'Category:Foo bar' })).toBe('ok');
  });

  it('matches the category whatever its spelling (URL underscores vs the job spaces, prefix case)', () => {
    for (const open of ['Category:Foo bar', 'Category:Foo_bar', 'category:Foo bar']) {
      expect(downloadStepState({ ...base, openJobId: '1', openCategory: open })).toBe('ok');
    }
  });

  it('the open download wins even while the lookup is still loading or before login is checked', () => {
    const open = { openJobId: '1', openCategory: 'Category:Foo bar' };
    expect(downloadStepState({ ...base, ...open, attached: 'loading' })).toBe('ok');
    expect(downloadStepState({ ...base, ...open, ready: false })).toBe('ok');
  });

  it('a finished or paused download of ANOTHER category does not appear under this category', () => {
    expect(downloadStepState({ ...base, openJobId: '1', openCategory: 'Category:Other' })).toBe('none');
  });

  it('a RUNNING download is always shown, whatever category the form above is on (there is one dashboard)', () => {
    expect(downloadStepState({ ...base, openJobId: '1', openCategory: 'Category:Other', running: true })).toBe('ok');
    expect(downloadStepState({ ...base, category: '', openJobId: '1', openCategory: 'Category:Other', running: true })).toBe('ok');
  });

  it('on the start page (no category) an open but idle download is not shown', () => {
    expect(downloadStepState({ ...base, category: '', openJobId: '1', openCategory: 'Category:Foo bar' })).toBe('none');
  });

  it('shows "loading" until the lookup and the first login check are done', () => {
    expect(downloadStepState({ ...base, attached: 'loading' })).toBe('loading');
    expect(downloadStepState({ ...base, ready: false })).toBe('loading');
  });

  it('"busy" or "missing" lookups just mean the placeholder (a running download is handled above)', () => {
    expect(downloadStepState({ ...base, attached: 'busy' })).toBe('none');
    expect(downloadStepState({ ...base, attached: 'none' })).toBe('none');
  });
});
