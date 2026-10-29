import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useCyclingPlaceholder } from '../src/composables/useCyclingPlaceholder';
import { EXAMPLE_CATEGORIES } from '../src/utils/exampleCategories';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCyclingPlaceholder', () => {
  it('starts on the first item and advances every interval, wrapping around', () => {
    const scope = effectScope();
    const current = scope.run(() => useCyclingPlaceholder(['a', 'b', 'c'], 3000));
    expect(current.value).toBe('a');
    vi.advanceTimersByTime(2999);
    expect(current.value).toBe('a');
    vi.advanceTimersByTime(1);
    expect(current.value).toBe('b');
    vi.advanceTimersByTime(3000);
    expect(current.value).toBe('c');
    vi.advanceTimersByTime(3000);
    expect(current.value).toBe('a');
    scope.stop();
  });

  it('stops when its scope is disposed (no timer left running)', () => {
    const scope = effectScope();
    const current = scope.run(() => useCyclingPlaceholder(['a', 'b'], 3000));
    scope.stop();
    vi.advanceTimersByTime(30_000);
    expect(current.value).toBe('a');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles empty and single-item lists without a timer', () => {
    const scope = effectScope();
    expect(scope.run(() => useCyclingPlaceholder([], 3000)).value).toBe('');
    expect(scope.run(() => useCyclingPlaceholder(['only'], 3000)).value).toBe('only');
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });
});

describe('EXAMPLE_CATEGORIES', () => {
  it('lists the eight Lingua Libre categories in order', () => {
    expect(EXAMPLE_CATEGORIES).toHaveLength(8);
    expect(EXAMPLE_CATEGORIES[0]).toBe('Category:Lingua_Libre_pronunciation_of_languages_of_Indonesia');
    expect(EXAMPLE_CATEGORIES[1]).toBe('Category:Lingua_Libre_pronunciation-sru');
    expect(EXAMPLE_CATEGORIES.at(-1)).toBe('Category:Lingua_Libre_pronunciation-other_(Q36759)');
    expect(EXAMPLE_CATEGORIES.every((c) => c.startsWith('Category:'))).toBe(true);
  });
});
