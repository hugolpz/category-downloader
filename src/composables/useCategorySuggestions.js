import { onScopeDispose, ref } from 'vue';
import { MIN_SEARCH_LENGTH, searchTerm } from '../api/suggestions';
import { parseCategory } from '../api/wiki';

/**
 * Debounced, cancellable, cached suggestions while the user types. Call inside `setup()`.
 * Suggestions are a convenience: any failure just means "no suggestions", never an error message.
 *
 * @param {object} options
 * @param {(typed: string, signal: AbortSignal) => Promise<unknown[]>} options.search does the API call
 * @param {number} [options.delayMs] wait after the last keystroke before searching
 * @param {number} [options.minLength] shortest searched name (without "Category:")
 */
export function useCategorySuggestions({ search, delayMs = 300, minLength = MIN_SEARCH_LENGTH }) {
  const items = ref([]);
  /** True once a search for the current text finished (so "no match" can be told apart from "not searched yet"). */
  const searched = ref(false);
  const pending = ref(false);
  const cache = new Map(); // wiki prefix + search term (lowercase) -> results, for this page session
  let timer;
  let controller;
  let latest = 0; // only the newest request may update the list

  function reset() {
    clearTimeout(timer);
    controller?.abort();
    latest++;
    items.value = [];
    searched.value = false;
    pending.value = false;
  }

  /** Call with the text in the field on every keystroke. */
  function onInput(typed) {
    const term = searchTerm(typed);
    if (term.length < minLength) return reset();

    clearTimeout(timer);
    controller?.abort();
    const key = `${parseCategory(typed).prefix}|${term.toLowerCase()}`;
    if (cache.has(key)) {
      latest++;
      items.value = cache.get(key);
      searched.value = true;
      pending.value = false;
      return;
    }
    searched.value = false;
    pending.value = true;
    const mine = ++latest;
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const found = await search(typed, controller.signal);
        if (mine !== latest) return;
        cache.set(key, found);
        items.value = found;
        searched.value = true;
      } catch {
        if (mine === latest) items.value = []; // aborted, offline, rate-limited, token expired: just no suggestions
      } finally {
        if (mine === latest) pending.value = false;
      }
    }, delayMs);
  }

  onScopeDispose(() => {
    clearTimeout(timer);
    controller?.abort();
  });

  return { items, searched, pending, onInput, reset };
}
