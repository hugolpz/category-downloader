import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { categoryInfo, listSubcategories, normalizeCategory } from '../api/commons';
import { useAuthStore } from './auth';
import { appRouter } from '../router';
import { categoryLocation } from '../utils/categoryPath';
import { buildQuery, buildQueryObject, parseParams } from '../utils/urlParams';

/**
 * The setup form. Its address-bar twin: the category is the path (/Category:Foo_bar), the other options are the
 * query (?subcats=…&delay=…&concurrency=…). Opening such a URL fills the form (setCategory / applyQuery); a
 * successful Check moves the address to the checked category.
 */
export const useSetupStore = defineStore('setup', () => {
  const auth = useAuthStore();
  const form = reactive({ category: '', ...parseParams(location.search) });
  const subcategories = ref([]);
  const includeSubcats = ref(form.subcats.length > 0);
  const rootInfo = ref(null);
  const busy = ref(false);
  const error = ref(null);

  const rootTitle = computed(() => normalizeCategory(form.category));
  const approxTotal = computed(() => {
    const sub = subcategories.value.filter((s) => form.subcats.includes(s.title)).reduce((n, s) => n + s.files, 0);
    return (rootInfo.value?.files ?? 0) + sub;
  });
  /** What "Copy share link" copies: /Category:Foo_bar?subcats=… (or just / while no category is typed). */
  const shareUrl = computed(() => {
    const target = form.category ? categoryLocation(form.category) : { name: 'home' };
    return location.origin + appRouter().resolve({ ...target, query: buildQueryObject(form) }).href;
  });

  /**
   * Put the category from the URL into the field. Whatever was checked for the previous category is dropped.
   * @param {string} value e.g. "Category:Foo_bar"
   * @returns {boolean} whether the field changed
   */
  function setCategory(value) {
    const next = String(value ?? '');
    if (normalizeCategory(next) === normalizeCategory(form.category)) return false;
    form.category = next;
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
    includeSubcats.value = next.subcats.length > 0;
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
      showCategoryInUrl();
    } catch (e) {
      rootInfo.value = null;
      error.value = e.message;
    } finally {
      busy.value = false;
    }
  }

  watch(includeSubcats, (on) => {
    if (!on) form.subcats = [];
    void check();
  });
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

  return { form, setCategory, applyQuery, subcategories, includeSubcats, rootInfo, busy, error, rootTitle, approxTotal, shareUrl, check };
});
