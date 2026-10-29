import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { categoryInfo, listSubcategories, normalizeCategory } from '../api/commons';
import { DEFAULT_FILTER, filterError } from '../engine/filter';
import { useAuthStore } from './auth';
import { appRouter } from '../router';
import { categoryLocation } from '../utils/categoryPath';
import { buildQuery, buildQueryObject, parseParams } from '../utils/urlParams';

/**
 * The setup form. Its address-bar twin: the category is the path (/Category:Foo_bar), the other options are the
 * query (?cats=…&delay=…&concurrency=…). Opening such a URL fills the form (setCategory / applyQuery); a
 * successful Check moves the address to the checked category.
 *
 * `form.cats` says which categories to download: null = just the top one; a list = exactly those, where the top
 * category's own files are included only if its title is in the list.
 */
export const useSetupStore = defineStore('setup', () => {
  const auth = useAuthStore();
  // `filter` is not part of the address: it only applies to the download you start from this page.
  const form = reactive({ category: '', ...parseParams(location.search), filter: { ...DEFAULT_FILTER } });
  const subcategories = ref([]);
  const rootInfo = ref(null);
  const busy = ref(false);
  const error = ref(null);

  const rootTitle = computed(() => normalizeCategory(form.category));

  /** "Also download subcategories": on = a selection list (the top category selected to begin with), off = just the top one. */
  const includeSubcats = computed({
    get: () => form.cats !== null,
    set(on) {
      form.cats = on ? (rootTitle.value ? [rootTitle.value] : []) : null;
      if (on) void check(); // list the subcategories
    },
  });

  /** The rows of the selection table: the top category first, so its own files can be included or left out. */
  const selectionRows = computed(() =>
    rootInfo.value
      ? [{ title: rootTitle.value, files: rootInfo.value.files, isTop: true }, ...subcategories.value.map((s) => ({ ...s, isTop: false }))]
      : [],
  );

  /** What will be listed and downloaded, in table order. */
  const selectedCategories = computed(() => {
    if (form.cats === null) return rootTitle.value ? [rootTitle.value] : [];
    const order = new Map(selectionRows.value.map((r, i) => [r.title, i]));
    return [...form.cats].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  });
  const filterProblem = computed(() => filterError(form.filter));
  const canStart = computed(() => selectedCategories.value.length > 0 && !filterProblem.value);

  const approxTotal = computed(() => {
    const files = new Map(selectionRows.value.map((r) => [r.title, r.files]));
    return selectedCategories.value.reduce((n, c) => n + (files.get(c) ?? 0), 0);
  });

  /** What "Copy share link" copies: /Category:Foo_bar?cats=… (or just / while no category is typed). */
  const shareUrl = computed(() => {
    const target = form.category ? categoryLocation(form.category) : { name: 'home' };
    return location.origin + appRouter().resolve({ ...target, query: buildQueryObject(form) }).href;
  });

  /**
   * Put the category from the URL into the field. Whatever was checked or selected for the previous category is dropped.
   * @param {string} value e.g. "Category:Foo_bar"
   * @returns {boolean} whether the field changed
   */
  function setCategory(value) {
    const next = String(value ?? '');
    if (normalizeCategory(next) === normalizeCategory(form.category)) return false;
    form.category = next;
    form.cats = null;
    rootInfo.value = null;
    subcategories.value = [];
    error.value = null;
    return true;
  }

  /** Load the options from a router query (a shared link, the Back button). Does nothing if they already match. */
  function applyQuery(query) {
    const next = parseParams(query);
    if (buildQuery(next) === buildQuery(form)) return;
    Object.assign(form, next); // options only: the category comes from the path
  }

  /** Make the address match the checked category: /Category:Foo_bar plus the options. */
  function showCategoryInUrl() {
    const router = appRouter();
    const route = router.currentRoute.value;
    if (route.name !== 'home' && route.name !== 'category') return;
    const target = categoryLocation(form.category);
    const same = route.name === 'category' && route.params.category === target.params.category;
    void router[same ? 'replace' : 'push']({ ...target, query: buildQueryObject(form) });
  }

  async function check() {
    if (busy.value || !auth.token || !rootTitle.value) return;
    busy.value = true;
    error.value = null;
    try {
      const info = (await categoryInfo([rootTitle.value], auth.token)).get(rootTitle.value);
      if (!info?.exists) throw new Error(`${rootTitle.value} does not exist`);
      rootInfo.value = info;
      subcategories.value = includeSubcats.value ? await listSubcategories(rootTitle.value, auth.token, auth.botSpeed === 'on') : [];
      if (form.cats !== null) {
        // Drop selected titles that are not this category's top or subcategories (a stale link, a renamed category).
        const valid = new Set([rootTitle.value, ...subcategories.value.map((s) => s.title)]);
        form.cats = form.cats.filter((c) => valid.has(c));
      }
      showCategoryInUrl();
    } catch (e) {
      rootInfo.value = null;
      error.value = e.message;
    } finally {
      busy.value = false;
    }
  }

  // Options (not the category, which only changes the address on Check) are mirrored into the query string.
  watch(
    () => buildQuery(form),
    () => {
      const router = appRouter();
      const route = router.currentRoute.value;
      if (route.name === 'home' || route.name === 'category')
        void router.replace({ name: route.name, params: route.params, query: buildQueryObject(form) });
    },
  );

  return {
    form,
    setCategory,
    applyQuery,
    subcategories,
    selectionRows,
    selectedCategories,
    canStart,
    filterProblem,
    includeSubcats,
    rootInfo,
    busy,
    error,
    rootTitle,
    approxTotal,
    shareUrl,
    check,
  };
});
