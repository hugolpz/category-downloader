<script setup>
import { t } from '../../i18n';
</script>

<template>
  <footer id="app-footer" class="mt-12" style="background: var(--surface-footer); color: var(--ink-on-dark-muted)">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm sm:px-8">
      <span>
        {{ t('cd-footer-made-by') }}
        <a
          id="author-link"
          href="https://github.com/hugolpz"
          target="_blank"
          rel="noopener"
          class="font-semibold"
          style="color: var(--ink-on-dark)"
          >Hugo Lopez</a
        >
      </span>
      <span class="flex-1" />
      <span id="privacy-note">{{ t('cd-footer-privacy') }}</span>
    </div>
  </footer>
</template>
