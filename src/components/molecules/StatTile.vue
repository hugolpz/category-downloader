<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  hint: { type: String, default: '' },
  /** 'default' | 'good' */
  tone: { type: String, default: 'default' },
});
</script>

<template>
  <div class="rounded-lg px-4 py-3" :style="{ background: tone === 'good' ? 'var(--forest-tint)' : 'var(--surface-sunken)' }">
    <div class="eyebrow">{{ label }}</div>
    <div
      class="num truncate font-display text-2xl font-semibold"
      :title="value"
      :style="{ color: tone === 'good' ? 'var(--forest-deep)' : 'var(--ink)' }"
    >
      {{ value }}
    </div>
    <div v-if="hint" class="muted truncate text-xs" :title="hint">{{ hint }}</div>
  </div>
</template>
