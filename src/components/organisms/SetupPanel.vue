<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { CdxButton, CdxCheckbox, CdxIcon, CdxLookup, CdxMessage } from '@wikimedia/codex';
import {
  cdxIconAlert,
  cdxIconCheck,
  cdxIconFolderPlaceholder,
  cdxIconLink,
  cdxIconSearch,
  cdxIconSearchRegularExpression,
} from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';
import { useJobStore } from '../../stores/job';
import { useSetupStore } from '../../stores/setup';
import { suggestCategories, toMenuItem } from '../../api/suggestions';
import { useCategorySuggestions } from '../../composables/useCategorySuggestions';
import { useCyclingPlaceholder } from '../../composables/useCyclingPlaceholder';
import { EXAMPLE_CATEGORIES } from '../../utils/exampleCategories';
import { normalizeFilter, parseDay } from '../../engine/filter';
import { t } from '../../i18n';
import { categoryLabel, categoryName } from '../../utils/categoryPath';

const auth = useAuthStore();
const setup = useSetupStore();
const job = useJobStore();
const running = computed(() => job.phase === 'running' || job.phase === 'stopping');
const copied = ref(false);

// The field shows a different real category every 3 s; Tab on an empty field fills it in.
const placeholder = useCyclingPlaceholder(EXAMPLE_CATEGORIES, 3000);
function onCategoryKeydown(event) {
  if (event.key !== 'Tab' || event.shiftKey || setup.form.category) return; // otherwise Tab moves focus as usual
  event.preventDefault();
  setup.form.category = placeholder.value;
}
const emit = defineEmits(['start']);

// Real Commons categories are suggested from 5 typed characters on (debounced, cancellable, cached).
const {
  items: suggestionItems,
  searched,
  pending: searching,
  onInput: searchSuggestions,
} = useCategorySuggestions({ search: (typed, signal) => suggestCategories(typed, auth.token, { signal }) });
const menuItems = computed(() => suggestionItems.value.map(toMenuItem));
const selected = ref(null);
function onTyping(text) {
  if (text === selected.value) return; // the box also fires this when a suggestion fills it in: do not search again
  searchSuggestions(text);
}
function onPick(value) {
  if (!value) return;
  setup.form.category = value;
  void setup.check(); // a suggestion is a real category: check it right away
}

// Check the category once logged in (covers URL prefill).
watch(
  () => auth.loggedIn,
  (ok) => ok && setup.form.category && !setup.rootInfo && setup.check(),
  { immediate: true },
);

// The table lists the top category first (its own files can be left out), then its subcategories.
const selectedCount = computed(() => setup.form.cats?.length ?? 0);
const allSelected = computed(() => selectedCount.value === setup.selectionRows.length);
const toggleAll = () => (setup.form.cats = allSelected.value ? [] : setup.selectionRows.map((r) => r.title));

// Dates are typed as YYYY/MM/DD; the filter keeps them as YYYY-MM-DD, and only once they are a real day.
const dateText = reactive({ from: setup.form.filter.from.replaceAll('-', '/'), to: setup.form.filter.to.replaceAll('-', '/') });
function onDate(field, text) {
  dateText[field] = text;
  setup.form.filter[field] = parseDay(text) ?? '';
}
const dateInvalid = (field) => !!dateText[field].trim() && !setup.form.filter[field];
// Wikimedia asks for at most 2 simultaneous media downloads: from 4 up, say so.
const tooManyDownloads = computed(() => setup.form.concurrency >= 4);
const filterActive = computed(() => normalizeFilter(setup.form.filter) !== null);

async function copyLink() {
  await navigator.clipboard.writeText(setup.shareUrl);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1800);
}
</script>

<template>
  <div id="setup-panel" class="flex flex-col gap-6">
    <!-- 1. category -->
    <section id="category-section" class="card p-6">
      <header class="mb-4 flex items-center gap-3">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full font-display font-bold"
          style="background: var(--forest); color: #fff"
          >1</span
        >
        <div>
          <h2 id="category-title" class="text-xl">{{ t('cd-step1-title') }}</h2>
          <p class="muted text-sm">{{ t('cd-step1-text') }}</p>
        </div>
      </header>

      <div class="flex items-start gap-2">
        <CdxLookup
          id="category-input"
          v-model:selected="selected"
          v-model:input-value="setup.form.category"
          :menu-items="menuItems"
          :menu-config="{ visibleItemLimit: 8 }"
          class="flex-1"
          :placeholder="placeholder"
          :start-icon="cdxIconSearch"
          :aria-label="t('cd-category-aria')"
          @input="onTyping"
          @update:selected="onPick"
          @keydown="onCategoryKeydown"
          @keyup.enter="setup.check()"
        >
          <template v-if="searched && !searching" #no-results>{{ t('cd-no-match') }}</template>
        </CdxLookup>
        <CdxButton id="category-check-button" :disabled="setup.busy || !setup.form.category" @click="setup.check()">{{
          setup.busy ? t('cd-checking') : t('cd-check')
        }}</CdxButton>
      </div>

      <p v-if="!setup.form.category" id="category-tab-hint" class="muted mt-2 text-xs">
        {{ t('cd-tab-hint') }}
      </p>

      <CdxMessage v-if="setup.error" id="category-error" type="error" class="mt-3">{{ setup.error }}</CdxMessage>
      <p v-if="setup.rootInfo" id="category-summary" class="mt-4 flex items-center gap-2 text-base">
        <CdxIcon :icon="cdxIconCheck" size="small" style="color: var(--forest)" />
        <span>{{
          t('cd-category-summary', categoryLabel(setup.rootTitle), setup.rootInfo.files, setup.rootInfo.files.toLocaleString())
        }}</span>
      </p>

      <template v-if="setup.rootInfo">
        <div class="mt-4 border-t border-line pt-4">
          <CdxCheckbox id="include-subcategories-checkbox" v-model="setup.includeSubcats"
            >{{ t('cd-include-subcats') }} <span class="muted">{{ t('cd-one-level') }}</span></CdxCheckbox
          >
          <div
            v-if="setup.includeSubcats && setup.subcategories.length"
            id="subcategory-picker"
            class="mt-3 overflow-hidden rounded-lg border border-line"
          >
            <div class="flex items-center justify-between px-4 py-2" style="background: var(--surface-sunken)">
              <span id="subcategory-selected-count" class="text-sm">{{
                t('cd-selected-count', selectedCount, setup.selectionRows.length)
              }}</span>
              <button
                id="subcategory-toggle-all-button"
                type="button"
                class="cursor-pointer border-0 bg-transparent text-sm font-semibold"
                style="color: var(--forest)"
                @click="toggleAll"
              >
                {{ allSelected ? t('cd-select-none') : t('cd-select-all') }}
              </button>
            </div>
            <ul id="subcategory-list" class="m-0 max-h-64 list-none overflow-y-auto p-0">
              <li v-for="(row, i) in setup.selectionRows" :key="row.title" class="border-t border-line first:border-t-0">
                <label class="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-sunken">
                  <input
                    :id="row.isTop ? 'top-category-option' : `subcategory-option-${i - 1}`"
                    v-model="setup.form.cats"
                    type="checkbox"
                    :value="row.title"
                    class="h-4 w-4"
                    style="accent-color: var(--forest)"
                  />
                  <span class="flex-1 truncate">
                    {{ categoryName(row.title) }}
                    <span
                      v-if="row.isTop"
                      id="top-category-badge"
                      class="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style="background: var(--forest-tint); color: var(--forest-deep)"
                      :title="t('cd-top-category-tip')"
                      >{{ t('cd-top-category') }}</span
                    >
                  </span>
                  <span class="num muted text-sm">{{ t('cd-row-files', row.files, row.files.toLocaleString()) }}</span>
                </label>
              </li>
            </ul>
          </div>
          <p v-else-if="setup.includeSubcats && !setup.busy" id="no-subcategories-note" class="muted mt-2 text-sm">
            {{ t('cd-no-subcats') }}
          </p>
          <p v-if="setup.includeSubcats && setup.subcategories.length" id="total-files-estimate" class="mt-3 text-sm">
            <template v-if="setup.canStart">{{ t('cd-total-estimate', setup.approxTotal.toLocaleString()) }}</template>
            <span v-else id="nothing-selected-hint" style="color: var(--gold-deep)">{{ t('cd-nothing-selected') }}</span>
          </p>
        </div>
      </template>
    </section>

    <!-- 2. folder + start -->
    <section id="folder-section" class="card p-6">
      <header class="mb-4 flex items-center gap-3">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full font-display font-bold"
          style="background: var(--forest); color: #fff"
          >2</span
        >
        <div>
          <h2 id="folder-title" class="text-xl">{{ t('cd-step2-title') }}</h2>
          <p class="muted text-sm">{{ t('cd-step2-text') }}</p>
        </div>
      </header>

      <div class="flex flex-wrap items-center gap-3">
        <CdxButton
          id="start-button"
          action="progressive"
          weight="primary"
          size="large"
          :disabled="!auth.loggedIn || !setup.rootInfo || !setup.canStart || running"
          @click="emit('start')"
        >
          <CdxIcon :icon="cdxIconFolderPlaceholder" size="small" /> {{ t('cd-start') }}
        </CdxButton>
        <CdxButton id="share-link-button" :disabled="!setup.form.category" @click="copyLink">
          <CdxIcon :icon="copied ? cdxIconCheck : cdxIconLink" size="small" /> {{ copied ? t('cd-link-copied') : t('cd-copy-link') }}
        </CdxButton>
        <span v-if="running" id="running-note" class="muted text-sm">{{ t('cd-running-note') }}</span>
        <span v-else-if="!setup.rootInfo" id="check-category-hint" class="muted text-sm">{{ t('cd-check-first') }}</span>
      </div>

      <!-- Locked on purpose: contributors must be credited via backlink, user's name and license.
           The per-file .json carries exactly those (descriptionurl, user, license), so it is never optional. -->
      <div id="credits-note" class="mt-5 rounded-lg px-4 py-3" style="background: var(--forest-tint)">
        <CdxCheckbox id="sidecars-checkbox" :model-value="true" disabled>
          {{ t('cd-sidecars-label') }}
          <span class="muted block text-sm">{{ t('cd-sidecars-note') }}</span>
        </CdxCheckbox>
      </div>

      <details id="filter-options" class="mt-5">
        <summary class="muted cursor-pointer text-sm font-medium">
          {{ t('cd-filter-summary') }}<span v-if="filterActive" class="ml-2 inline-block h-2 w-2 rounded-full align-middle bg-maize" />
        </summary>
        <div class="mt-3 flex flex-wrap items-end gap-x-3 gap-y-3">
          <div class="flex min-w-[16rem] flex-1 flex-col gap-1">
            <div class="flex h-6 items-center gap-2">
              <label for="filter-title-input" class="text-sm font-medium">{{ t('cd-filter-title-label') }}</label>
              <label class="inline-flex cursor-pointer" :title="t('cd-filter-regex')">
                <input
                  id="filter-regex-checkbox"
                  v-model="setup.form.filter.regex"
                  type="checkbox"
                  class="peer sr-only"
                  :aria-label="t('cd-filter-regex')"
                />
                <span
                  class="inline-flex text-ink-3 hover:text-ink-2 [&_.cdx-icon]:text-inherit peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-maize"
                  ><CdxIcon :icon="cdxIconSearchRegularExpression"
                /></span>
              </label>
            </div>
            <input
              id="filter-title-input"
              v-model="setup.form.filter.title"
              type="text"
              class="field"
              :title="t('cd-filter-title-note')"
              :placeholder="setup.form.filter.regex ? '^Paris.*\\.jpe?g$' : 'Eiffel'"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label for="filter-from-input" class="flex h-6 items-center text-sm font-medium">{{ t('cd-filter-start') }}</label>
            <input
              id="filter-from-input"
              :value="dateText.from"
              type="text"
              inputmode="numeric"
              class="field w-32"
              :class="{ 'field-invalid': dateInvalid('from') }"
              :title="t('cd-filter-dates')"
              :placeholder="t('cd-filter-date-placeholder')"
              @input="onDate('from', $event.target.value)"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label for="filter-to-input" class="flex h-6 items-center text-sm font-medium">{{ t('cd-filter-end') }}</label>
            <input
              id="filter-to-input"
              :value="dateText.to"
              type="text"
              inputmode="numeric"
              class="field w-32"
              :class="{ 'field-invalid': dateInvalid('to') }"
              :title="t('cd-filter-dates')"
              :placeholder="t('cd-filter-date-placeholder')"
              @input="onDate('to', $event.target.value)"
            />
          </div>
        </div>
        <CdxMessage v-if="dateInvalid('from') || dateInvalid('to')" id="filter-date-error" type="error" :inline="true" class="mt-3">{{
          t('cd-filter-date-invalid')
        }}</CdxMessage>
        <CdxMessage v-else-if="setup.filterProblem" id="filter-error" type="error" :inline="true" class="mt-3">{{
          setup.filterProblem
        }}</CdxMessage>
        <p v-else-if="filterActive" class="muted mt-3 text-sm">{{ t('cd-filter-count-note') }}</p>
      </details>

      <details id="advanced-options" class="mt-5">
        <summary class="muted cursor-pointer text-sm font-medium">
          {{ t('cd-advanced-summary') }}
          <CdxIcon
            v-if="tooManyDownloads"
            :icon="cdxIconAlert"
            size="small"
            class="ml-1 align-middle"
            style="color: var(--gold-deep)"
            :title="t('cd-concurrency-warning')"
            :aria-label="t('cd-concurrency-warning')"
          />
        </summary>
        <div class="mt-3 flex flex-col gap-4">
          <div class="flex flex-wrap gap-6">
            <label class="flex flex-col gap-1 text-sm font-medium">
              {{ t('cd-delay-label') }}
              <input id="delay-input" v-model.number="setup.form.delayMs" type="number" min="0" max="5000" step="50" class="field w-32" />
              <span class="muted font-normal">{{ t('cd-delay-note') }}</span>
            </label>
            <label class="flex flex-col gap-1 text-sm font-medium">
              {{ t('cd-concurrency-label') }}
              <input id="concurrency-input" v-model.number="setup.form.concurrency" type="number" min="1" max="5" class="field w-32" />
              <span class="muted font-normal"
                >{{ t('cd-concurrency-note') }}
                <CdxIcon
                  v-if="tooManyDownloads"
                  id="concurrency-warning"
                  :icon="cdxIconAlert"
                  size="small"
                  class="ml-1 align-middle"
                  style="color: var(--gold-deep)"
                  :title="t('cd-concurrency-warning')"
                  :aria-label="t('cd-concurrency-warning')"
              /></span>
            </label>
          </div>
        </div>
      </details>
    </section>
  </div>
</template>
