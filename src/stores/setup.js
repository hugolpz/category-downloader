import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { categoryInfo, listSubcategories, normalizeCategory } from '../api/commons';
import { useAuthStore } from './auth';
import { buildQuery, parseParams } from '../utils/urlParams';

export const useSetupStore = defineStore('setup', () => {
  const auth = useAuthStore();
  const form = reactive(parseParams(location.search)); // URL prefill
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
  const shareUrl = computed(() => `${location.origin}${location.pathname}${buildQuery(form)}`);

  async function check() {
    if (!auth.token || !rootTitle.value) return;
    busy.value = true;
    error.value = null;
    try {
      const info = (await categoryInfo([rootTitle.value], auth.token)).get(rootTitle.value);
      if (!info?.exists) throw new Error(`${rootTitle.value} does not exist`);
      rootInfo.value = info;
      subcategories.value = includeSubcats.value ? await listSubcategories(rootTitle.value, auth.token, auth.botSpeed === 'on') : [];
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
  // Keep the address bar in sync so the page URL is itself the share link.
  watch(form, () => history.replaceState(null, '', `${location.pathname}${buildQuery(form)}`), { deep: true });

  return { form, subcategories, includeSubcats, rootInfo, busy, error, rootTitle, approxTotal, shareUrl, check };
});
