<script setup>
import { computed } from 'vue';
import { CdxButton, CdxIcon, CdxMessage, CdxProgressIndicator } from '@wikimedia/codex';
import { cdxIconPause, cdxIconPlay, cdxIconSuccess } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';
import { useJobStore } from '../../stores/job';
import { useProgressStore } from '../../stores/progress';
import { formatDuration, formatRate } from '../../utils/format';
import FailedList from '../molecules/FailedList.vue';
import ProgressBar from '../molecules/ProgressBar.vue';
import RollingLog from '../molecules/RollingLog.vue';
import StatTile from '../molecules/StatTile.vue';

const auth = useAuthStore();
const job = useJobStore();
const p = useProgressStore();

const running = computed(() => job.phase === 'running');
const stopping = computed(() => job.phase === 'stopping');
const celebrate = computed(() => job.phase === 'done');
const title = computed(
  () =>
    ({
      running: 'Downloading…',
      stopping: 'Pausing…',
      stopped: 'Paused',
      done: 'All done!',
      'paused-auth': 'Please log in again',
      error: 'Stopped by an error',
      idle: 'Ready',
    })[job.phase],
);
const finished = computed(() => p.counts.done + p.counts.failed);
const folder = computed(() => job.folder ?? 'your folder');

const eta = computed(() => {
  const left = Math.max(0, p.total - finished.value);
  return running.value && p.perSecond && left ? formatDuration((left / p.perSecond) * 1000) : '—';
});
const timeLabel = computed(() => (p.freshRun ? 'Time taken' : 'This session'));

const tiles = computed(() =>
  celebrate.value
    ? [
        {
          label: 'Files saved',
          value: p.counts.done.toLocaleString(),
          hint: p.counts.failed ? `${p.counts.failed.toLocaleString()} to retry` : 'No failures',
          tone: 'good',
        },
        { label: 'Average speed', value: formatRate(p.summary.perSecond) },
        { label: timeLabel.value, value: formatDuration(p.summary.elapsedMs) },
        { label: 'Saved in', value: folder.value, hint: 'inside the folder you picked' },
      ]
    : [
        { label: 'Saved so far', value: p.counts.done.toLocaleString(), hint: `of ~${p.total.toLocaleString()}`, tone: 'good' },
        running.value
          ? { label: 'Speed', value: formatRate(p.perSecond) }
          : { label: 'Session average', value: formatRate(p.summary.perSecond) },
        { label: 'Time left', value: eta.value },
        { label: 'Waiting', value: p.counts.pending.toLocaleString() },
      ],
);
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="card overflow-hidden">
      <!-- celebration banner -->
      <div v-if="celebrate" class="flex items-center gap-4 px-6 py-5" style="background: var(--surface-hero); color: var(--ink-on-dark)">
        <span
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style="background: var(--maize); color: var(--surface-footer)"
        >
          <CdxIcon :icon="cdxIconSuccess" />
        </span>
        <div class="min-w-0">
          <h2 class="text-2xl" style="color: var(--ink-on-dark)">{{ title }}</h2>
          <p style="color: var(--ink-on-dark-muted)">
            <strong class="num" style="color: var(--ink-on-dark)">{{ p.counts.done.toLocaleString() }}</strong> files saved to
            <strong style="color: var(--ink-on-dark)">{{ folder }}</strong> in {{ formatDuration(p.summary.elapsedMs) }}.
            <template v-if="p.counts.failed">{{ p.counts.failed.toLocaleString() }} just need another try.</template>
          </p>
        </div>
      </div>

      <div class="p-6">
        <header v-if="!celebrate" class="mb-1 flex flex-wrap items-center gap-3">
          <h2 class="text-2xl">{{ title }}</h2>
          <CdxProgressIndicator v-if="running || stopping">{{ title }}</CdxProgressIndicator>
          <span class="flex-1" />
          <CdxButton v-if="running" @click="job.stop()"><CdxIcon :icon="cdxIconPause" size="small" /> Pause</CdxButton>
          <CdxButton
            v-else-if="job.unfinished"
            action="progressive"
            weight="primary"
            :disabled="!auth.loggedIn"
            @click="job.resumeOrPick()"
          >
            <CdxIcon :icon="cdxIconPlay" size="small" /> Resume
          </CdxButton>
        </header>
        <div v-else-if="job.unfinished" class="mb-4">
          <CdxButton action="progressive" weight="primary" :disabled="!auth.loggedIn" @click="job.resumeOrPick()">
            <CdxIcon :icon="cdxIconPlay" size="small" /> Resume to retry the rest
          </CdxButton>
        </div>

        <p v-if="stopping" class="muted mb-3 text-sm">
          Finishing downloads in progress and writing the README. This can take a few seconds.
        </p>
        <p v-else-if="job.unfinished && !auth.loggedIn" class="muted mb-3 text-sm">Log in to resume.</p>
        <p v-if="job.resumeError" class="mb-3 text-sm" style="color: var(--terracotta)">{{ job.resumeError }}</p>

        <CdxMessage v-if="job.phase === 'paused-auth'" type="warning" :inline="false" class="mb-4">{{ job.message }}</CdxMessage>
        <CdxMessage v-else-if="job.phase === 'error'" type="error" :inline="false" class="mb-4">{{ job.message }}</CdxMessage>

        <p v-if="!celebrate" class="mb-2 text-lg">
          <strong class="num font-display text-3xl">{{ p.counts.done.toLocaleString() }}</strong>
          <span class="muted"> of ~{{ p.total.toLocaleString() }} files saved</span>
          <span v-if="!p.enumDone" class="muted text-sm"> · still listing ({{ p.enumerated.toLocaleString() }} found)</span>
          <span v-if="p.counts.failed" class="text-sm" style="color: var(--gold-deep)">
            · {{ p.counts.failed.toLocaleString() }} to retry, see below</span
          >
        </p>
        <ProgressBar :value="finished" :max="Math.max(p.total, 1)" label="Download progress" />

        <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile v-for="t in tiles" :key="t.label" v-bind="t" />
        </div>
      </div>
    </div>

    <RollingLog :recent="p.recent" :upcoming="p.upcoming" />
    <FailedList v-if="p.counts.failed" :count="p.counts.failed" @retry="job.requeueFailed()" />

    <details v-if="job.readme" class="card p-5">
      <summary class="cursor-pointer font-display text-lg font-semibold">
        README.md <span class="muted font-body text-sm font-normal">— saved in the download folder</span>
      </summary>
      <pre class="mb-0 mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed">{{ job.readme }}</pre>
    </details>
  </section>
</template>
