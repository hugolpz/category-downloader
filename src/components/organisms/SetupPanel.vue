<script setup>
import { computed, ref, watch } from 'vue';
import { CdxButton, CdxCheckbox, CdxIcon, CdxMessage, CdxTextInput } from '@wikimedia/codex';
import { cdxIconCheck, cdxIconFolderPlaceholder, cdxIconLink, cdxIconSearch } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';
import { useSetupStore } from '../../stores/setup';

const auth = useAuthStore();
const setup = useSetupStore();
const copied = ref(false);
const emit = defineEmits(['start']);

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
        <CdxTextInput
          id="category-input"
          v-model="setup.form.category"
          class="flex-1"
          placeholder="e.g. Lingua Libre pronunciation-fra"
          :start-icon="cdxIconSearch"
          aria-label="Category name"
          @keyup.enter="setup.check()"
        />
        <CdxButton id="category-check-button" :disabled="setup.busy || !setup.form.category" @click="setup.check()">{{
          setup.busy ? 'Checking…' : 'Check'
        }}</CdxButton>
      </div>

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

      <details id="advanced-options" class="mt-5">
        <summary class="muted cursor-pointer text-sm font-medium">Advanced options</summary>
        <div class="mt-3 flex flex-col gap-4">
          <CdxCheckbox id="sidecars-checkbox" v-model="setup.form.sidecars">
            Save <code>.json</code> metadata file next to each download
            <span class="muted block text-sm">Same record as the metadata line: links, uploader, license and dates.</span>
          </CdxCheckbox>
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
