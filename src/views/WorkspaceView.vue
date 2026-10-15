<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { normalizeCategory } from '../api/commons';
import HeroIntro from '../components/organisms/HeroIntro.vue';
import ProgressPanel from '../components/organisms/ProgressPanel.vue';
import SetupPanel from '../components/organisms/SetupPanel.vue';
import ResumePrompt from '../components/molecules/ResumePrompt.vue';
import { useAuthStore } from '../stores/auth';
import { useJobStore } from '../stores/job';
import { useSetupStore } from '../stores/setup';
import { revealSection } from '../utils/revealSection';
import { downloadStepState } from './workspaceState';

// The whole app is this one page: 1. category, 2. folder + Start, 3. the download. The address only says which
// category the form is on: "/" has none, "/Category:Foo_bar" has one (and fills the field).
const props = defineProps({ category: { type: String, default: '' } });
const auth = useAuthStore();
const job = useJobStore();
const setup = useSetupStore();
const route = useRoute();

// Result of the last look-up of the field's category: 'loading' (first one) | 'ok' | 'missing' | 'busy' | 'none'
const attached = ref(props.category ? 'loading' : 'none');
const running = computed(() => job.phase === 'running' || job.phase === 'stopping');
// What step 3 is about: the category in the FIELD (the address fills it, and so does typing or picking a suggestion).
const field = computed(() => setup.rootTitle);
const step3 = computed(() =>
  downloadStepState({
    attached: attached.value,
    ready: auth.ready,
    openJobId: job.jobId,
    openCategory: job.category,
    category: field.value,
    running: running.value,
  }),
);

// The address sets the field.
watch(
  () => props.category,
  (category) => {
    if (category) setup.setCategory(category);
  },
  { immediate: true },
);

// The field drives step 3: a category that has a saved download loads its LAST STATS (cards, "Just saved", "Up next");
// any other category leaves step 3 at its resting state. Local lookup only (no API call), so it also follows typing,
// a little delayed so a half-typed name does not trigger one lookup per key.
let timer;
let first = true;
watch(
  field,
  (title) => {
    clearTimeout(timer);
    const look = async () => {
      if (!title) {
        attached.value = 'none';
        return;
      }
      attached.value = await job.attachCategory(title);
      // Arrived by address and nothing saved here: show how many files the category has.
      if (attached.value === 'missing' && auth.loggedIn && title === normalizeCategory(props.category)) await setup.check();
    };
    timer = setTimeout(look, first ? 0 : 250);
    first = false;
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

// When a download starts (Start, or Resume), bring step 3 into view: the dashboard is below the setup, out of sight.
const stepTitle = ref(null);
watch(
  () => job.runStarts,
  async () => {
    await nextTick(); // let the dashboard replace the placeholder first
    revealSection(stepTitle.value);
  },
);

// Options in the query (?cats=…&delay=…) fill the form.
watch(
  () => route.query,
  (query) => {
    if (Object.keys(query).length) setup.applyQuery(query);
  },
  { immediate: true },
);
</script>

<template>
  <div id="workspace-view" class="flex flex-col gap-6">
    <template v-if="auth.ready">
      <ResumePrompt v-if="auth.loggedIn" />
      <HeroIntro v-if="!auth.loggedIn" />
      <!-- steps 1 and 2: always there, so the page never changes shape under you -->
      <SetupPanel v-else @start="job.chooseFolderAndStart()" />

      <!-- step 3 -->
      <section v-if="auth.loggedIn || step3 === 'ok'" id="step-download" class="flex scroll-mt-4 flex-col gap-4">
        <header class="flex items-center gap-3">
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display font-bold"
            :style="{ background: step3 === 'ok' ? 'var(--forest)' : 'var(--border-strong)', color: '#fff' }"
            >3</span
          >
          <div>
            <h2 id="step-download-title" ref="stepTitle" tabindex="-1" class="text-xl" style="outline: none">Watch it download</h2>
            <p class="muted text-sm">Speed, what was just saved, what comes next and the final summary appear here.</p>
          </div>
        </header>

        <ProgressPanel v-if="step3 === 'ok'" />
        <p v-else id="step-download-placeholder" class="card muted p-6 text-sm">
          {{ step3 === 'loading' ? 'Loading…' : 'Press “Choose folder & start” in step 2 and the download shows up here.' }}
        </p>
      </section>
    </template>
  </div>
</template>
