<script setup>
import { RouterLink } from 'vue-router';
import { CdxButton, CdxIcon } from '@wikimedia/codex';
import { cdxIconLogIn, cdxIconLogOut } from '@wikimedia/codex-icons';
import BrandMark from '../atoms/BrandMark.vue';
import BotSpeedBadge from '../molecules/BotSpeedBadge.vue';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
</script>

<template>
  <header id="app-header" class="border-b border-line bg-paper">
    <div class="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-8">
      <RouterLink id="brand-link" :to="{ name: 'home' }" class="flex items-center gap-2.5 no-underline" style="color: var(--ink)">
        <BrandMark />
        <span class="font-display text-xl font-bold leading-none">CommonsFlow</span>
      </RouterLink>
      <span id="app-tagline" class="eyebrow hidden lg:inline">Bulk download from Wikimedia Commons</span>
      <span class="flex-1" />
      <BotSpeedBadge id="bot-speed-badge" :state="auth.botSpeed" />
      <template v-if="auth.loggedIn">
        <span id="user-name" class="hidden text-sm font-medium sm:inline">{{ auth.userName }}</span>
        <CdxButton id="logout-button" weight="quiet" aria-label="Log out" title="Log out" @click="auth.logout()"
          ><CdxIcon :icon="cdxIconLogOut"
        /></CdxButton>
      </template>
      <CdxButton v-else id="login-button" action="progressive" weight="primary" @click="auth.login()">
        <CdxIcon :icon="cdxIconLogIn" size="small" /> Log in
      </CdxButton>
    </div>
  </header>
</template>
