<script setup>
import { computed, ref, watch } from 'vue';
import { CdxButton, CdxCheckbox, CdxIcon, CdxLookup, CdxMessage } from '@wikimedia/codex';
import { cdxIconCheck, cdxIconFolderPlaceholder, cdxIconLink, cdxIconSearch } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';
import { useSetupStore } from '../../stores/setup';
import { suggestCategories, toMenuItem } from '../../api/suggestions';
import { useCategorySuggestions } from '../../composables/useCategorySuggestions';
import { useCyclingPlaceholder } from '../../composables/useCyclingPlaceholder';
import { EXAMPLE_CATEGORIES } from '../../utils/exampleCategories';

const auth = useAuthStore();
const setup = useSetupStore();
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
  (ok) => ok && setup.form.category && setup.check(),
  { immediate: true },
);

const selectedCount = computed(() => setup.form.subcats.length);
const allSelected = computed(() => selectedCount.value === setup.subcategories.length);
const toggleAll = () => (setup.form.subcats = allSelected.value ? [] : setup.subcategories.map((s) => s.title));

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
          <h2 id="category-title" class="text-xl">Which category?</h2>
          <p class="muted text-sm">Type a Commons category name, with or without “Category:”.</p>
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
          aria-label="Category name"
          @input="onTyping"
          @update:selected="onPick"
          @keydown="onCategoryKeydown"
          @keyup.enter="setup.check()"
        >
          <template v-if="searched && !searching" #no-results>No matching category found.</template>
        </CdxLookup>
        <CdxButton id="category-check-button" :disabled="setup.busy || !setup.form.category" @click="setup.check()">{{
          setup.busy ? 'Checking…' : 'Check'
        }}</CdxButton>
      </div>

      <p v-if="!setup.form.category" id="category-tab-hint" class="muted mt-2 text-xs">
        Press <kbd class="rounded border border-line bg-sunken px-1 font-mono">Tab</kbd> to use the suggestion.
      </p>

      <CdxMessage v-if="setup.error" id="category-error" type="error" class="mt-3">{{ setup.error }}</CdxMessage>
      <p v-if="setup.rootInfo" id="category-summary" class="mt-4 flex items-center gap-2 text-base">
        <CdxIcon :icon="cdxIconCheck" size="small" style="color: var(--forest)" />
        <span
          ><strong>{{ setup.rootTitle.replace(/^Category:/, '') }}</strong> has
          <strong class="num">{{ setup.rootInfo.files.toLocaleString() }}</strong> files.</span
        >
      </p>

      <template v-if="setup.rootInfo">
        <div class="mt-4 border-t border-line pt-4">
          <CdxCheckbox id="include-subcategories-checkbox" v-model="setup.includeSubcats"
            >Include subcategories <span class="muted">(one level down)</span></CdxCheckbox
          >
          <div
            v-if="setup.includeSubcats && setup.subcategories.length"
            id="subcategory-picker"
            class="mt-3 overflow-hidden rounded-lg border border-line"
          >
            <div class="flex items-center justify-between px-4 py-2" style="background: var(--surface-sunken)">
              <span id="subcategory-selected-count" class="text-sm"
                ><strong>{{ selectedCount }}</strong> of {{ setup.subcategories.length }} selected</span
              >
              <button
                id="subcategory-toggle-all-button"
                type="button"
                class="cursor-pointer border-0 bg-transparent text-sm font-semibold"
                style="color: var(--forest)"
                @click="toggleAll"
              >
                {{ allSelected ? 'Select none' : 'Select all' }}
              </button>
            </div>
            <ul id="subcategory-list" class="m-0 max-h-64 list-none overflow-y-auto p-0">
              <li v-for="(s, i) in setup.subcategories" :key="s.title" class="border-t border-line first:border-t-0">
                <label class="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-sunken">
                  <input
                    :id="`subcategory-option-${i}`"
                    v-model="setup.form.subcats"
                    type="checkbox"
                    :value="s.title"
                    class="h-4 w-4"
                    style="accent-color: var(--forest)"
                  />
                  <span class="flex-1 truncate">{{ s.title.replace(/^Category:/, '') }}</span>
                  <span class="num muted text-sm">{{ s.files.toLocaleString() }} files</span>
                </label>
              </li>
            </ul>
          </div>
          <p v-else-if="setup.includeSubcats && !setup.busy" id="no-subcategories-note" class="muted mt-2 text-sm">
            This category has no subcategories.
          </p>
          <p v-if="selectedCount" id="total-files-estimate" class="mt-3 text-sm">
            About <strong class="num">{{ setup.approxTotal.toLocaleString() }}</strong> files in total.
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
          <h2 id="folder-title" class="text-xl">Where should the files go?</h2>
          <p class="muted text-sm">Pick a folder on your computer. CommonsFlow creates a sub-folder named after the category.</p>
        </div>
      </header>

      <div class="flex flex-wrap items-center gap-3">
        <CdxButton
          id="start-button"
          action="progressive"
          weight="primary"
          size="large"
          :disabled="!auth.loggedIn || !setup.rootInfo"
          @click="emit('start')"
        >
          <CdxIcon :icon="cdxIconFolderPlaceholder" size="small" /> Choose folder &amp; start
        </CdxButton>
        <CdxButton id="share-link-button" :disabled="!setup.form.category" @click="copyLink">
          <CdxIcon :icon="copied ? cdxIconCheck : cdxIconLink" size="small" /> {{ copied ? 'Link copied' : 'Copy share link' }}
        </CdxButton>
        <span v-if="!setup.rootInfo" id="check-category-hint" class="muted text-sm">Check a category first.</span>
      </div>

      <!-- Locked on purpose: contributors must be credited via backlink, user's name and license.
           The per-file .json carries exactly those (descriptionurl, user, license), so it is never optional. -->
      <div id="credits-note" class="mt-5 rounded-lg px-4 py-3" style="background: var(--forest-tint)">
        <CdxCheckbox id="sidecars-checkbox" :model-value="true" disabled>
          Save <code>.json</code> metadata file next to each download
          <span class="muted block text-sm">
            Always on. Contributors must be credited via backlink, user's name and license: each <code>.json</code> holds all three.
          </span>
        </CdxCheckbox>
      </div>

      <details id="advanced-options" class="mt-5">
        <summary class="muted cursor-pointer text-sm font-medium">Advanced options</summary>
        <div class="mt-3 flex flex-col gap-4">
          <div class="flex flex-wrap gap-6">
            <label class="flex flex-col gap-1 text-sm font-medium">
              Pause between files (ms)
              <input id="delay-input" v-model.number="setup.form.delayMs" type="number" min="0" max="5000" step="50" class="field w-32" />
              <span class="muted font-normal">Keeps Wikimedia servers happy.</span>
            </label>
            <label class="flex flex-col gap-1 text-sm font-medium">
              Downloads at once
              <input id="concurrency-input" v-model.number="setup.form.concurrency" type="number" min="1" max="5" class="field w-32" />
              <span class="muted font-normal">1 to 5.</span>
            </label>
          </div>
        </div>
      </details>
    </section>
  </div>
</template>
