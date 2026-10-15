import { onScopeDispose, ref } from 'vue';

/**
 * A ref that steps through `items` every `intervalMs`, wrapping around. Starts immediately and stops by
 * itself when the surrounding component (or effect scope) is torn down, so call it inside `setup()`.
 *
 * @param {string[]} items
 * @param {number} [intervalMs]
 * @returns {import('vue').Ref<string>} the item currently shown ('' when `items` is empty)
 */
export function useCyclingPlaceholder(items, intervalMs = 3000) {
  const current = ref(items[0] ?? '');
  if (items.length > 1) {
    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % items.length;
      current.value = items[index];
    }, intervalMs);
    onScopeDispose(() => clearInterval(timer));
  }
  return current;
}
