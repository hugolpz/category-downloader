import { describe, expect, it, vi } from 'vitest';
import { revealSection } from '../src/utils/revealSection';

const fakeElement = () => ({ scrollIntoView: vi.fn(), focus: vi.fn() });
const motion = (reduce) => ({ matchMedia: (q) => ({ matches: q.includes('prefers-reduced-motion') && reduce }) });

describe('revealSection', () => {
  it('scrolls the section to the top of the window, smoothly, and focuses it', () => {
    const el = fakeElement();
    revealSection(el, motion(false));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(el.focus).toHaveBeenCalledWith({ preventScroll: true }); // so focusing does not cut the smooth scroll short
  });

  it('jumps instead of animating for people who prefer reduced motion', () => {
    const el = fakeElement();
    revealSection(el, motion(true));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(el.focus).toHaveBeenCalledTimes(1);
  });

  it('copes with a browser that has no matchMedia', () => {
    const el = fakeElement();
    revealSection(el, {});
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('does nothing when the element is not there (yet)', () => {
    expect(() => revealSection(null, motion(false))).not.toThrow();
    expect(() => revealSection(undefined, motion(false))).not.toThrow();
  });
});
