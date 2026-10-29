<script setup>
import { computed } from 'vue';
import { CdxIcon, CdxSelect } from '@wikimedia/codex';
import { cdxIconEdit } from '@wikimedia/codex-icons';
import { LANGUAGES, TRANSLATE_URL, locale, missingCount, setLocale, t } from '../../i18n';

const items = LANGUAGES.map(({ code, name }) => ({ value: code, label: name }));
const selected = computed({
  get: () => locale.value,
  set: (code) => setLocale(code),
});
// The pencil gently pulses while the selected language lacks messages: an invitation to translate them.
const needsTranslations = computed(() => missingCount(locale.value) > 0);
</script>

<template>
  <div id="language-selector" class="language-select flex items-center gap-2">
    <CdxSelect id="language-select" v-model:selected="selected" :menu-items="items" :aria-label="t('cd-language')" class="w-40" />
    <a
      id="translate-link"
      :href="TRANSLATE_URL(locale)"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-sunken no-underline hover:border-line-strong"
      :class="needsTranslations ? 'nudge text-maize-deep' : 'text-ink-3 hover:text-forest'"
      :aria-label="t('cd-translate')"
      :title="t('cd-translate')"
    >
      <CdxIcon :icon="cdxIconEdit" size="small" />
    </a>
  </div>
</template>
