import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getValidToken, handleRedirect, login, logout as clearToken, refreshToken } from '../auth/oauth';
import { AuthExpiredError, fetchUserInfo, hasBotSpeed } from '../api/commons';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null);
  const userName = ref(null);
  const botSpeed = ref('unknown');
  const error = ref(null);
  const loggedIn = computed(() => !!token.value && !!userName.value);

  async function init() {
    try {
      await handleRedirect();
      token.value = (await getValidToken())?.accessToken ?? null;
      if (token.value) await refreshUser();
    } catch (e) {
      error.value = e.message;
    }
  }

  async function refreshUser(retry = true) {
    if (!token.value) return;
    try {
      const info = await fetchUserInfo(token.value);
      userName.value = info.name;
      botSpeed.value = hasBotSpeed(info) ? 'on' : 'off';
    } catch (e) {
      if (e instanceof AuthExpiredError && retry) {
        // Access token died early: try the refresh cookie once before giving up.
        token.value = (await refreshToken())?.accessToken ?? null;
        if (token.value) return refreshUser(false);
        logout();
      } else if (e instanceof AuthExpiredError) logout();
      else error.value = e.message;
    }
  }

  function logout() {
    void clearToken();
    token.value = null;
    userName.value = null;
    botSpeed.value = 'unknown';
  }

  return { token, userName, botSpeed, error, loggedIn, init, login, logout, refreshUser };
});
