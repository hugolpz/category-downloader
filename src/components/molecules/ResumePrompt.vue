<script setup>
import { computed } from 'vue';
import { CdxButton, CdxIcon } from '@wikimedia/codex';
import { cdxIconPlay } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';
import { useJobStore } from '../../stores/job';
import { jobRoot } from '../../utils/categoryPath';

const auth = useAuthStore();
const job = useJobStore();

const subcategoryCount = computed(() =>
  job.unfinished ? job.unfinished.categories.filter((c) => c !== jobRoot(job.unfinished)).length : 0,
);
const rootExcluded = computed(() => !!job.unfinished && !job.unfinished.categories.includes(jobRoot(job.unfinished)));

async function discard() {
  if (confirm('Discard the saved session? Already downloaded files stay on disk, but progress is forgotten.')) await job.discard();
}
</script>

<template>
  <!-- Only on a fresh page load; during a session the Downloads panel has its own Resume button. -->
  <section v-if="job.unfinished && !job.jobId" id="resume-prompt" class="card p-5" style="border-left: 4px solid var(--maize)">
    <h2 id="resume-prompt-title" class="mb-1 text-xl">Welcome back. Pick up where you left off?</h2>
    <p class="muted mb-4">
      <strong style="color: var(--ink)">{{ jobRoot(job.unfinished).replace(/^Category:/, '') }}</strong>
      <span v-if="subcategoryCount"> (+{{ subcategoryCount }} subcategories)</span>
      <span v-if="rootExcluded"> (without the top category's own files)</span>
      · started {{ new Date(job.unfinished.startedAt).toLocaleString() }}
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <CdxButton
        id="resume-prompt-resume-button"
        action="progressive"
        weight="primary"
        :disabled="!auth.loggedIn"
        @click="job.resumeOrPick()"
      >
        <CdxIcon :icon="cdxIconPlay" size="small" /> Resume
      </CdxButton>
      <CdxButton id="resume-prompt-discard-button" @click="discard">Discard</CdxButton>
      <span v-if="!auth.loggedIn" class="muted">Log in first.</span>
      <span v-if="job.resumeError" style="color: var(--terracotta)">{{ job.resumeError }}</span>
    </div>
  </section>
</template>
