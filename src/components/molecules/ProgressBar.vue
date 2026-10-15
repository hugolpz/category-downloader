<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, required: true },
  max: { type: Number, required: true },
  label: { type: String, required: true },
});
const pct = computed(() => (props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0));
</script>

<template>
  <div role="progressbar" :aria-label="label" aria-valuemin="0" :aria-valuemax="max" :aria-valuenow="value" class="flex items-center gap-3">
    <div class="h-3 flex-1 overflow-hidden rounded-full" style="background: var(--surface-sunken)">
      <div
        class="h-full rounded-full transition-all duration-500"
        :style="{ width: pct + '%', background: 'linear-gradient(90deg, var(--forest), var(--leaf))' }"
      />
    </div>
    <span class="num w-12 text-right text-sm font-semibold">{{ pct < 10 && pct > 0 ? pct.toFixed(1) : Math.floor(pct) }}%</span>
  </div>
</template>
