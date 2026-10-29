<script setup>
import { t } from '../../i18n';
</script>

<!-- Only shown when the account has high API limits (it speeds up listing, not downloading). -->
<template>
  <span
    :title="t('cd-bot-tip-on')"
    class="inline-flex cursor-help items-center gap-2 rounded-full border border-solid border-leaf bg-forest-tint px-3 py-1 text-[13px] font-medium text-forest-deep"
  >
    <span class="h-2 w-2 rounded-full" style="background: var(--forest-light)" />
    {{ t('cd-bot-on') }}
  </span>
</template>
