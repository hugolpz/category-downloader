import { normalizeCategory } from '../api/commons';

/**
 * What step 3 (the download) of the single page shows.
 *
 *  'ok'       the download's dashboard: summary cards, "Just saved / Up next", failures, README
 *  'loading'  still looking
 *  'none'     nothing to show yet: a placeholder that says the progress will appear here
 *
 * The dashboard is shown for the download that is RUNNING (whatever category the form above is on, there is only
 * one dashboard) and for the open download of the category in the address. The open download wins over the one-off
 * result of looking it up (`attached`): you Check a category (the address becomes /Category:X) and press Start; the
 * address does not change, so nothing looks it up again, yet the dashboard must appear.
 *
 * @param {{ attached: 'loading' | 'ok' | 'missing' | 'busy' | 'none', ready: boolean, openJobId: string | null,
 *           openCategory: string | null, category: string, running: boolean }} s
 */
export function downloadStepState({ attached, ready, openJobId, openCategory, category, running }) {
  if (openJobId && running) return 'ok';
  if (openJobId && openCategory && category && normalizeCategory(openCategory) === normalizeCategory(category)) return 'ok';
  if (!ready || attached === 'loading') return 'loading';
  return 'none';
}
