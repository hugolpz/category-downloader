<script setup>
import { CdxButton, CdxIcon } from '@wikimedia/codex';
import { cdxIconLogIn } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const steps = [
  ['1', 'Log in', 'with your Wikimedia account'],
  ['2', 'Pick a category', 'any size, even 500,000 files'],
  ['3', 'Choose a folder', 'files are saved straight to it'],
];
</script>

<template>
  <section class="rounded-xl px-6 py-10 sm:px-12 sm:py-14" style="background: var(--surface-hero); color: var(--ink-on-dark)">
    <p class="eyebrow mb-3" style="color: var(--maize)">Wikimedia Commons, to your disk</p>
    <h1 class="max-w-2xl text-3xl font-bold leading-tight sm:text-5xl" style="color: var(--ink-on-dark)">
      Bring a whole Commons category home.
    </h1>
    <p class="mt-4 max-w-xl text-base sm:text-lg" style="color: var(--ink-on-dark-muted)">
      Save thousands of audio, image or video files, with their licenses, into a folder on your computer. Pause whenever you like, even
      close the tab: it picks up exactly where it stopped.
    </p>
    <div class="mt-7">
      <CdxButton action="progressive" weight="primary" size="large" @click="auth.login()">
        <CdxIcon :icon="cdxIconLogIn" size="small" /> Log in with Wikimedia
      </CdxButton>
    </div>
    <ol class="mt-10 grid list-none gap-4 p-0 sm:grid-cols-3">
      <li v-for="[n, title, sub] in steps" :key="n" class="flex items-start gap-3">
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
