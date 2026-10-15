<script setup>
import { onMounted, ref, watch } from 'vue';
import { CdxButton, CdxIcon } from '@wikimedia/codex';
import { cdxIconAlert, cdxIconReload } from '@wikimedia/codex-icons';
import { useProgressStore } from '../../stores/progress';

const props = defineProps({ count: { type: Number, required: true } });
const emit = defineEmits(['retry']);
const progress = useProgressStore();
const PAGE = 20;
const offset = ref(0);
const rows = ref([]);

async function load() {
  rows.value = (await progress.failedPage(offset.value, PAGE)).rows;
}
onMounted(load);
watch(() => [props.count, offset.value], load);

async function exportJson() {
  const url = URL.createObjectURL(await progress.exportFailed());
  Object.assign(document.createElement('a'), { href: url, download: 'errors.json' }).click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="card p-5" style="border-left: 4px solid var(--maize)">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h3 id="failed-title" class="flex items-center gap-2 text-lg">
        <CdxIcon :icon="cdxIconAlert" style="color: var(--maize)" />{{ count.toLocaleString() }} file{{ count === 1 ? ' needs' : 's need' }}
        another try
      </h3>
      <span class="flex-1" />
      <CdxButton id="retry-failed-button" size="small" action="progressive" weight="primary" @click="emit('retry')"
        ><CdxIcon :icon="cdxIconReload" size="small" /> Retry all</CdxButton
      >
      <CdxButton id="export-errors-button" size="small" @click="exportJson">Export errors.json</CdxButton>
    </div>
    <ul id="failed-files" class="m-0 list-none p-0 font-mono text-xs leading-6">
      <li v-for="r in rows" :key="r.pageid" class="truncate" :title="r.lastError">
        {{ r.title.replace(/^File:/, '') }} <span class="muted">— {{ r.lastError }}</span>
      </li>
    </ul>
    <div v-if="count > PAGE" class="mt-3 flex gap-2">
      <CdxButton id="failed-previous-button" size="small" :disabled="offset === 0" @click="offset -= PAGE">Previous</CdxButton>
      <CdxButton id="failed-next-button" size="small" :disabled="offset + PAGE >= count" @click="offset += PAGE">Next</CdxButton>
    </div>
  </section>
</template>
