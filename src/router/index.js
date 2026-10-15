import { createRouter, createWebHistory } from 'vue-router';
import { hasPendingLogin } from '../auth/oauth';
import { useAuthStore } from '../stores/auth';
import { categoryLocation } from '../utils/categoryPath';

/**
 * Every URL the app answers (history mode; server/index.mjs serves index.html for any unknown GET path).
 *
 *   /              start page: type a category, then press Check (the address becomes /Category:…)
 *   /Category:Foo_bar  the same single page with that category already in the field (and its download, if this
 *                  browser has one, shown in step 3). Same spelling as Commons URLs. Optional
 *                  options in the query: ?subcats=Category:A|Category:B&delay=500&concurrency=2
 *   anything else  friendly "not found"
 *
 * The login callback (/oauth/wikimedia/success?code=…, or the root) needs no route of its own: the
 * guard below finishes the login and sends the user back to the page they were on.
 * Views are loaded lazily so the first paint stays small.
 */
const workspace = () => import('../views/WorkspaceView.vue'); // one page for both routes: the same instance is reused

export const routes = [
  { path: '/', name: 'home', component: workspace, meta: { title: 'Download a Commons category' } },
  // The regex keeps this route to "Category:…" (any case of the prefix); the title may contain / ( ) % and accents.
  { path: '/:category([Cc]ategory:.+)', name: 'category', component: workspace, props: true, meta: { title: 'Download' } },
  { path: '/:rest(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: 'Page not found' } },
];

/**
 * @param {object} [options]
 * @param {import('vue-router').RouterHistory} [options.history]
 * @param {import('vue-router').RouteRecordRaw[]} [options.routeTable] override in tests (to avoid loading components)
 * @param {{ pendingLogin?: () => boolean, completeLogin?: (search: string) => Promise<string> }} [options.deps]
 */
export function createAppRouter({ history = createWebHistory(), routeTable = routes, deps = {} } = {}) {
  const { pendingLogin = hasPendingLogin, completeLogin = (search) => useAuthStore().completeLogin(search) } = deps;
  const router = createRouter({ history, routes: routeTable });

  // Wikimedia redirects back with ?code=… to whatever callback URL the OAuth consumer has registered.
  // Only react when WE started a login (a stale ?code= is just ignored).
  router.beforeEach(async (to) => {
    if (to.query.code && pendingLogin()) {
      const search = new URLSearchParams(Object.entries(to.query).map(([k, v]) => [k, String(v)])).toString();
      return await completeLogin(search); // a path + query to redirect to
    }
  });

  // Old shared links looked like /?category=Foo: send them to /Category:Foo (other options stay in the query).
  router.beforeEach((to) => {
    if (to.name === 'home' && typeof to.query.category === 'string' && to.query.category) {
      const { category, ...query } = to.query;
      return { ...categoryLocation(category), query, replace: true };
    }
  });

  router.afterEach((to) => {
    if (typeof document === 'undefined') return;
    const what = to.name === 'category' ? String(to.params.category).replace(/_/g, ' ') : to.meta.title;
    document.title = what ? `${what} · CommonsFlow` : 'CommonsFlow';
  });
  return router;
}

let instance;
/** The one router of the running app (created on first use; needs a browser). Stores use it to navigate. */
export const appRouter = () => (instance ??= createAppRouter());
