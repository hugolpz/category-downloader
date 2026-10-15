<script setup>
import { computed } from 'vue';

// 'unknown' | 'on' | 'off'
const props = defineProps({ state: { type: String, required: true } });

const label = computed(() => ({ on: 'Bot speed: on', off: 'Bot speed: off', unknown: 'Bot speed' })[props.state]);
const tip = computed(() =>
  props.state === 'on'
    ? 'High API limits are active for your account: listing is up to 10× faster.'
    : props.state === 'off'
      ? 'Standard API limits. Everything works, it just needs more requests to list a category.'
      : 'Log in to check whether your account has high API limits.',
);
</script>

<template>
  <span
    :title="tip"
    class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-medium cursor-help"
    :class="state === 'on' ? 'border-leaf bg-forest-tint text-forest-deep' : 'border-line bg-sunken text-ink-3'"
  >
    <span class="h-2 w-2 rounded-full" :style="{ background: state === 'on' ? 'var(--forest-light)' : 'var(--border-strong)' }" />
    {{ label }}
  </span>
</template>
