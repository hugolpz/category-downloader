<script setup>
import { RouterLink } from 'vue-router';
import { t } from '../i18n';
</script>

<template>
  <section id="not-found" class="card mx-auto max-w-xl p-8 text-center">
    <p class="eyebrow mb-2">{{ t('cd-404-code') }}</p>
    <h1 class="mb-3 text-3xl font-bold">{{ t('cd-404-title') }}</h1>
    <p class="muted mb-6">{{ t('cd-404-text') }}</p>
    <RouterLink id="not-found-home-link" :to="{ name: 'home' }" class="font-semibold">{{ t('cd-404-home') }}</RouterLink>
  </section>
</template>
