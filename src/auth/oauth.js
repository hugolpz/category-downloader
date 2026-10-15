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

/** Call on app start: finishes the redirect if `?code=` is present. Returns true if a login was completed. */
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const returnTo = sessionStorage.getItem('cf.returnTo') ?? '/';
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem('cf.returnTo');
  // The callback path (e.g. /oauth/wikimedia/success) is not a real page: go back to where the user was.
  history.replaceState(null, '', returnTo);
  if (!verifier || params.get('state') !== expectedState) throw new Error('OAuth state mismatch');

  const token = await postAuth('/auth/token', { code, code_verifier: verifier });
  if (!token) throw new Error('Token exchange failed');
  return true;
}

async function postAuth(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CommonsFlow' },
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
