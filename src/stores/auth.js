import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getValidToken, handleRedirect, login, logout as clearToken, refreshToken } from '../auth/oauth';
import { AuthExpiredError, fetchUserInfo, hasBotSpeed } from '../api/commons';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null);
  const userName = ref(null);
  const botSpeed = ref('unknown');
  const error = ref(null);
  /** False until the first token check finished, so pages can avoid flashing the logged-out view. */
  const ready = ref(false);
  const loggedIn = computed(() => !!token.value && !!userName.value);

  async function init() {
    try {
      token.value = (await getValidToken())?.accessToken ?? null;
      if (token.value) await refreshUser();
    } catch (e) {
      error.value = e.message;
    } finally {
      ready.value = true;
    }
  }

  /**
   * Called by the router when Wikimedia sends the user back with ?code=. Returns the page to go back to.
   * @param {string} search query string of the callback URL
   * @returns {Promise<string>}
   */
  async function completeLogin(search) {
    try {
      const returnTo = await handleRedirect(search);
      token.value = (await getValidToken())?.accessToken ?? null;
      if (token.value) await refreshUser();
      return returnTo ?? '/';
    } catch (e) {
      error.value = e.message;
      return '/';
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

  return { token, userName, botSpeed, error, ready, loggedIn, init, completeLogin, login, logout, refreshUser };
});
