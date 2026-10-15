<script setup>
import { CdxIcon } from '@wikimedia/codex';
import { cdxIconCheck, cdxIconTray } from '@wikimedia/codex-icons';

defineProps({
  recent: { type: Array, required: true },
  upcoming: { type: Array, required: true },
});
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <section
      v-for="col in [
        { id: 'recent-log', title: 'Just saved', icon: cdxIconCheck, rows: recent, empty: 'Nothing saved yet.', tone: 'var(--forest)' },
        { id: 'upcoming-log', title: 'Up next', icon: cdxIconTray, rows: upcoming, empty: 'Queue is empty.', tone: 'var(--ink-3)' },
      ]"
      :id="col.id"
      :key="col.title"
      class="min-w-0 rounded-lg p-3"
      style="background: var(--surface-sunken)"
    >
      <h3 class="eyebrow mb-2 flex items-center gap-1.5 font-body">
        <CdxIcon :icon="col.icon" size="small" :style="{ color: col.tone }" />{{ col.title }}
      </h3>
      <ol v-if="col.rows.length" :id="`${col.id}-list`" class="m-0 list-none p-0 font-mono text-xs leading-6">
        <li v-for="(n, i) in col.rows" :key="i" class="truncate" :title="n" :style="{ opacity: 1 - i * 0.025 }">{{ n }}</li>
      </ol>
      <p v-else class="muted text-sm">{{ col.empty }}</p>
    </section>
  </div>
</template>
