// OAuth 2.0 Authorization Code + PKCE for a confidential Wikimedia consumer.
// The client secret and refresh token live on our server (server/index.mjs); the browser only holds the access token.
const AUTHORIZE_URL = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize';

/** Client id and callback URL come from the server at runtime (see /auth/config), so one build serves dev and production. */
async function authConfig() {
  const res = await fetch('/auth/config');
  if (!res.ok) throw new Error('Could not load the login configuration');
  return res.json();
}

const VERIFIER_KEY = 'cf.pkce.verifier';
const STATE_KEY = 'cf.pkce.state';
const TOKEN_KEY = 'cf.token';

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomString = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function login() {
  const { clientId, redirectUri } = await authConfig();
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  // Keep the current page + query string (prefill params) across the round trip.
  sessionStorage.setItem('cf.returnTo', location.pathname + location.search);
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  location.assign(url.toString());
}

/** True while a login we started is waiting for its redirect back (the PKCE verifier is kept in sessionStorage). */
export const hasPendingLogin = () => !!sessionStorage.getItem(VERIFIER_KEY);

/**
 * Finish the redirect from Wikimedia: check `state`, exchange the code (on our server) for tokens.
 * Returns the page the user was on before logging in (path + query), or null if `search` holds no code.
 * The caller (the router guard) navigates there; this function never touches the address bar.
 *
 * @param {string} [search] query string of the callback URL
 * @returns {Promise<string | null>}
 */
export async function handleRedirect(search = location.search) {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  if (!code) return null;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const returnTo = sessionStorage.getItem('cf.returnTo') ?? '/';
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem('cf.returnTo');
  if (!verifier || params.get('state') !== expectedState) throw new Error('OAuth state mismatch');

  const token = await postAuth('/auth/token', { code, code_verifier: verifier });
  if (!token) throw new Error('Token exchange failed');
  return returnTo;
}

async function postAuth(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CategoryDownloader' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const token = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 14400) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

/** Ask the server for a fresh access token using the httpOnly refresh cookie. Null if there is no session. */
export const refreshToken = () => postAuth('/auth/refresh');

/** Stored token if still valid for at least `skewMs`; otherwise try a refresh. */
export async function getValidToken(skewMs = 60_000) {
  const t = loadToken(skewMs);
  return t ?? refreshToken();
}

export function loadToken(skewMs = 0) {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
    return t && t.expiresAt - skewMs > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export async function logout() {
  localStorage.removeItem(TOKEN_KEY);
  await postAuth('/auth/logout').catch(() => null);
}
