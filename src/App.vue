<script setup>
import { onMounted, watch } from 'vue';
import { RouterView } from 'vue-router';
import { CdxMessage } from '@wikimedia/codex';
import AppFooter from './components/organisms/AppFooter.vue';
import AppHeader from './components/organisms/AppHeader.vue';
import { t } from './i18n';
import { useAuthStore } from './stores/auth';
import { useJobStore } from './stores/job';
import { useProgressStore } from './stores/progress';

const auth = useAuthStore();
const job = useJobStore();
const progress = useProgressStore();
const supported = 'showDirectoryPicker' in window;

onMounted(async () => {
  await auth.init();
  await job.checkUnfinished();
});
// Whichever job is open (just started, resumed, or opened from its /Category:… page) is the one we poll.
watch(
  () => job.jobId,
  (id) => progress.watchJob(id),
);
</script>

<template>
  <div id="app-shell" class="flex min-h-dvh flex-col">
    <AppHeader />
    <main id="main-content" class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <CdxMessage v-if="!supported" id="browser-support-warning" type="warning" :inline="false">
        {{ t('cd-browser-unsupported') }}
      </CdxMessage>
      <CdxMessage v-if="auth.error" id="app-error" type="error" :inline="false">{{ auth.error }}</CdxMessage>

      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
