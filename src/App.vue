<script setup>
import { computed, onMounted, watch } from 'vue';
import { CdxMessage } from '@wikimedia/codex';
import AppFooter from './components/organisms/AppFooter.vue';
import AppHeader from './components/organisms/AppHeader.vue';
import HeroIntro from './components/organisms/HeroIntro.vue';
import ProgressPanel from './components/organisms/ProgressPanel.vue';
import SetupPanel from './components/organisms/SetupPanel.vue';
import ResumePrompt from './components/molecules/ResumePrompt.vue';
import { useAuthStore } from './stores/auth';
import { useJobStore } from './stores/job';
import { useProgressStore } from './stores/progress';

const auth = useAuthStore();
const job = useJobStore();
const progress = useProgressStore();
const supported = 'showDirectoryPicker' in window;
const busy = computed(() => job.phase === 'running' || job.phase === 'stopping');

onMounted(async () => {
  await auth.init();
  await job.checkUnfinished();
});
watch(
  () => job.jobId,
  (id) => progress.watchJob(id),
);

async function start() {
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'commonsflow' });
    await job.startNew(dir);
  } catch (e) {
    if (e.name !== 'AbortError') auth.error = e.message;
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <AppHeader />
    <main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <CdxMessage v-if="!supported" type="warning" :inline="false">
        This browser cannot save into a chosen folder. Please use Chrome, Edge or another Chromium-based browser.
      </CdxMessage>
      <CdxMessage v-if="auth.error" type="error" :inline="false">{{ auth.error }}</CdxMessage>

      <HeroIntro v-if="!auth.loggedIn" />
      <template v-else>
        <ResumePrompt />
        <SetupPanel v-if="!busy" @start="start" />
        <ProgressPanel v-if="job.jobId" />
      </template>
    </main>
    <AppFooter />
  </div>
</template>
