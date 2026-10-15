/**
 * Bring a section into view and give it keyboard focus: smooth scrolling (plain jump for people who prefer reduced
 * motion), and focus on the element so screen readers announce it and the next Tab continues from there.
 * `preventScroll` keeps the focus call from cutting the smooth scroll short.
 *
 * The element needs `tabindex="-1"` (focusable by script, not part of the Tab order).
 *
 * @param {HTMLElement | null | undefined} el the heading (or section) to reveal
 * @param {{ matchMedia?: (query: string) => { matches: boolean } }} [win] injectable for tests
 */
export function revealSection(el, win = typeof window === 'undefined' ? {} : window) {
  if (!el) return;
  const reduceMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}
