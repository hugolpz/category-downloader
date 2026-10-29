<script setup>
import { computed } from 'vue';
import { t } from '../../i18n';
import { CdxButton, CdxIcon } from '@wikimedia/codex';
import { cdxIconLogIn } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const steps = computed(() => [1, 2, 3].map((n) => [String(n), t(`cd-hero-step${n}-title`), t(`cd-hero-step${n}-text`)]));
</script>

<template>
  <section
    id="hero-intro"
    class="rounded-xl px-6 py-10 sm:px-12 sm:py-14"
    style="background: var(--surface-hero); color: var(--ink-on-dark)"
  >
    <p class="eyebrow mb-3" style="color: var(--maize)">{{ t('cd-hero-eyebrow') }}</p>
    <h1 id="hero-title" class="max-w-2xl text-3xl font-bold leading-tight sm:text-5xl" style="color: var(--ink-on-dark)">
      {{ t('cd-hero-title') }}
    </h1>
    <p id="hero-description" class="mt-4 max-w-xl text-base sm:text-lg" style="color: var(--ink-on-dark-muted)">
      {{ t('cd-hero-description') }}
    </p>
    <div class="mt-7">
      <CdxButton id="hero-login-button" action="progressive" weight="primary" size="large" @click="auth.login()">
        <CdxIcon :icon="cdxIconLogIn" size="small" /> {{ t('cd-hero-login') }}
      </CdxButton>
    </div>
    <ol id="hero-steps" class="mt-10 grid list-none gap-4 p-0 sm:grid-cols-3">
      <li v-for="[n, title, sub] in steps" :id="`hero-step-${n}`" :key="n" class="flex items-start gap-3">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display font-bold"
          style="background: var(--maize); color: var(--surface-footer)"
          >{{ n }}</span
        >
        <span>
          <strong class="block">{{ title }}</strong>
          <span class="text-sm" style="color: var(--ink-on-dark-muted)">{{ sub }}</span>
        </span>
      </li>
    </ol>
  </section>
</template>
