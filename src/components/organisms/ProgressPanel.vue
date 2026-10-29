<script setup>
import { computed } from 'vue';
import { CdxButton, CdxIcon, CdxMessage, CdxProgressIndicator } from '@wikimedia/codex';
import { cdxIconPause, cdxIconPlay, cdxIconSuccess } from '@wikimedia/codex-icons';
import { useAuthStore } from '../../stores/auth';
import { useJobStore } from '../../stores/job';
import { useProgressStore } from '../../stores/progress';
import { t } from '../../i18n';
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
const title = computed(() => t(`cd-phase-${job.phase}`));
const finished = computed(() => p.counts.done + p.counts.failed);
const folder = computed(() => job.folder ?? t('cd-folder-fallback'));

const eta = computed(() => {
  const left = Math.max(0, p.total - finished.value);
  return running.value && p.perSecond && left ? formatDuration((left / p.perSecond) * 1000) : '—';
});
const tiles = computed(() =>
  celebrate.value
    ? [
        {
          id: 'stat-files-saved',
          label: t('cd-stat-files-saved'),
          value: p.counts.done.toLocaleString(),
          hint: p.counts.failed ? t('cd-stat-to-retry', p.counts.failed.toLocaleString()) : t('cd-stat-no-failures'),
          tone: 'good',
        },
        { id: 'stat-average-speed', label: t('cd-stat-average-speed'), value: p.hasTiming ? formatRate(p.averagePerSecond) : '—' },
        { id: 'stat-time-taken', label: t('cd-stat-time-taken'), value: p.hasTiming ? formatDuration(p.activeMs) : '—' },
        { id: 'stat-folder', label: t('cd-stat-saved-in'), value: folder.value, hint: t('cd-stat-saved-in-hint') },
      ]
    : [
        {
          id: 'stat-saved-so-far',
          label: t('cd-stat-saved-so-far'),
          value: p.counts.done.toLocaleString(),
          hint: t('cd-stat-of-total', p.total.toLocaleString()),
          tone: 'good',
        },
        running.value
          ? { id: 'stat-speed', label: t('cd-stat-speed'), value: formatRate(p.perSecond) }
          : { id: 'stat-average-speed', label: t('cd-stat-average-speed'), value: p.hasTiming ? formatRate(p.averagePerSecond) : '—' },
        running.value
          ? { id: 'stat-time-left', label: t('cd-stat-time-left'), value: eta.value }
          : { id: 'stat-time-taken', label: t('cd-stat-time-spent'), value: p.hasTiming ? formatDuration(p.activeMs) : '—' },
        { id: 'stat-waiting', label: t('cd-stat-waiting'), value: p.counts.pending.toLocaleString() },
      ],
);
</script>

<template>
  <section id="progress-panel" class="flex flex-col gap-6">
    <div id="progress-summary-card" class="card overflow-hidden">
      <!-- celebration banner -->
      <div
        v-if="celebrate"
        id="finish-banner"
        class="flex items-center gap-4 px-6 py-5"
        style="background: var(--surface-hero); color: var(--ink-on-dark)"
      >
        <span
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style="background: var(--maize); color: var(--surface-footer)"
        >
          <CdxIcon :icon="cdxIconSuccess" />
        </span>
        <div class="min-w-0">
          <h2 id="progress-title" class="text-2xl" style="color: var(--ink-on-dark)">{{ title }}</h2>
          <p id="finish-summary" style="color: var(--ink-on-dark-muted)">
            {{
              p.hasTiming
                ? t('cd-finish-summary-timed', p.counts.done, p.counts.done.toLocaleString(), folder, formatDuration(p.activeMs))
                : t('cd-finish-summary', p.counts.done, p.counts.done.toLocaleString(), folder)
            }}
            <template v-if="p.counts.failed">{{ t('cd-finish-failed', p.counts.failed, p.counts.failed.toLocaleString()) }}</template>
          </p>
        </div>
      </div>

      <div class="p-6">
        <p v-if="job.category" id="progress-category" class="eyebrow mb-1 truncate" :title="job.category">
          {{ job.category.replace(/_/g, ' ') }}
        </p>
        <header v-if="!celebrate" id="progress-header" class="mb-1 flex flex-wrap items-center gap-3">
          <h2 id="progress-title" class="text-2xl">{{ title }}</h2>
          <CdxProgressIndicator v-if="running || stopping" id="progress-spinner">{{ title }}</CdxProgressIndicator>
          <span class="flex-1" />
          <CdxButton v-if="running" id="pause-button" @click="job.stop()"
            ><CdxIcon :icon="cdxIconPause" size="small" /> {{ t('cd-pause') }}</CdxButton
          >
          <CdxButton
            v-else-if="job.unfinished"
            id="progress-resume-button"
            action="progressive"
            weight="primary"
            :disabled="!auth.loggedIn"
            @click="job.resumeOrPick()"
          >
            <CdxIcon :icon="cdxIconPlay" size="small" /> {{ t('cd-resume') }}
          </CdxButton>
        </header>
        <div v-else-if="job.unfinished" id="finished-resume" class="mb-4">
          <CdxButton id="retry-rest-button" action="progressive" weight="primary" :disabled="!auth.loggedIn" @click="job.resumeOrPick()">
            <CdxIcon :icon="cdxIconPlay" size="small" /> {{ t('cd-resume-rest') }}
          </CdxButton>
        </div>

        <p v-if="stopping" id="pausing-note" class="muted mb-3 text-sm">
          {{ t('cd-pausing-note') }}
        </p>
        <p v-else-if="job.unfinished && !auth.loggedIn" id="login-to-resume-note" class="muted mb-3 text-sm">
          {{ t('cd-login-to-resume') }}
        </p>
        <p v-if="job.resumeError" id="resume-error" class="mb-3 text-sm" style="color: var(--terracotta)">{{ job.resumeError }}</p>

        <CdxMessage v-if="job.phase === 'paused-auth'" id="login-expired-message" type="warning" :inline="false" class="mb-4">{{
          job.message
        }}</CdxMessage>
        <CdxMessage v-else-if="job.phase === 'error'" id="engine-error-message" type="error" :inline="false" class="mb-4">{{
          job.message
        }}</CdxMessage>

        <p v-if="!celebrate" id="progress-counter" class="mb-2 text-lg">
          <strong class="num font-display text-3xl">{{ p.counts.done.toLocaleString() }}</strong>
          <span class="muted"> {{ t('cd-counter-rest', p.total.toLocaleString()) }}</span>
          <span v-if="!p.enumDone" class="muted text-sm"> · {{ t('cd-counter-listing', p.enumerated.toLocaleString()) }}</span>
          <span v-if="p.counts.failed" class="text-sm" style="color: var(--gold-deep)">
            · {{ t('cd-counter-failed', p.counts.failed.toLocaleString()) }}</span
          >
        </p>
        <ProgressBar id="progress-bar" :value="finished" :max="Math.max(p.total, 1)" :label="t('cd-progress-label')" />

        <div id="stats-grid" class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile v-for="t in tiles" :key="t.label" v-bind="t" />
        </div>
      </div>
    </div>

    <RollingLog id="rolling-log" :recent="p.recent" :upcoming="p.upcoming" />
    <FailedList v-if="p.counts.failed" id="failed-list" :count="p.counts.failed" @retry="job.requeueFailed()" />

    <details v-if="job.readme" id="readme-viewer" class="card p-5">
      <summary class="cursor-pointer font-display text-lg font-semibold">
        README.md <span class="muted font-body text-sm font-normal">— {{ t('cd-readme-note') }}</span>
      </summary>
      <pre id="readme-content" class="mb-0 mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed">{{ job.readme }}</pre>
    </details>
  </section>
</template>
