// Tiny dependency-free server for Toolforge / wmcloud: serves dist/ and holds the OAuth client secret.
// The browser never sees the secret or the refresh token (kept in an httpOnly cookie).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
// VITE_* names are accepted so an existing dev .env keeps working.
const CLIENT_ID = process.env.OAUTH_CLIENT_ID ?? process.env.VITE_OAUTH_CLIENT_ID;
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI ?? process.env.VITE_OAUTH_REDIRECT_URI;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const TOKEN_URL = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token';
const API_URL = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia's UA policy wants a descriptive agent with contact info; browsers cannot set one, so we do.
const USER_AGENT = `CommonsFlow/0.1 (${process.env.CONTACT ?? 'https://github.com/hugolpz'}) node`;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const COOKIE = 'cf_rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
const SECURE = process.env.INSECURE_COOKIES ? '' : '; Secure';

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET and OAUTH_REDIRECT_URI must be set');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 16_384) throw new Error('body too large');
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
};

const getCookie = (req, name) =>
  (req.headers.cookie ?? '')
    .split(/;\s*/)
    .map((p) => p.split('='))
    .find(([k]) => k === name)?.[1];

const refreshCookie = (value, maxAge) => `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/auth${SECURE}; Max-Age=${maxAge}`;

async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok && !!body.access_token, body };
}

function sendTokens(res, body) {
  const headers = body.refresh_token ? { 'Set-Cookie': refreshCookie(body.refresh_token, COOKIE_MAX_AGE) } : {};
  json(res, 200, { access_token: body.access_token, expires_in: body.expires_in }, headers);
}

async function handleAuth(req, res, path) {
  // Public values the SPA needs to start the login. Read at runtime so one build works for dev and production.
  if (req.method === 'GET' && path === '/auth/config') return json(res, 200, { clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
  // Custom header forces a CORS preflight, so cross-site pages cannot call these endpoints.
  if (req.method !== 'POST' || req.headers['x-requested-with'] !== 'CommonsFlow') {
    return json(res, 403, { error: 'forbidden' });
  }
  if (path === '/auth/token') {
    const { code, code_verifier } = await readBody(req);
    if (!code || !code_verifier) return json(res, 400, { error: 'missing parameters' });
    // redirect_uri comes from our own config, never from the client.
    const { ok, body } = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier, redirect_uri: REDIRECT_URI });
    return ok ? sendTokens(res, body) : json(res, 401, { error: body.error ?? 'token_exchange_failed' });
  }
  if (path === '/auth/refresh') {
    const rt = getCookie(req, COOKIE);
    if (!rt) return json(res, 401, { error: 'no_session' });
    const { ok, body } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt });
    if (!ok) return json(res, 401, { error: body.error ?? 'refresh_failed' }, { 'Set-Cookie': refreshCookie('', 0) });
    return sendTokens(res, body);
  }
  if (path === '/auth/logout') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': refreshCookie('', 0) });
  }
  return json(res, 404, { error: 'not_found' });
}

// Same-origin relay to the Commons Action API: avoids CORS (Commons only allows listed origins)
// and lets us send a proper User-Agent. Fixed upstream host, GET only, so it is not an open proxy.
async function handleApi(req, res, search) {
  if (req.method !== 'GET' || req.headers['x-requested-with'] !== 'CommonsFlow') {
    return json(res, 403, { error: 'forbidden' });
  }
  const params = new URLSearchParams(search);
  params.delete('origin');
  const headers = { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity' };
  if (req.headers.authorization?.startsWith('Bearer ')) headers.Authorization = req.headers.authorization;
  const up = await fetch(`${API_URL}?${params}`, { headers });
  const out = { 'Content-Type': up.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' };
  const retry = up.headers.get('retry-after');
  if (retry) out['Retry-After'] = retry;
  res.writeHead(up.status, out);
  res.end(Buffer.from(await up.arrayBuffer()));
}

async function serveStatic(req, res, path) {
  const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  let file = join(DIST, rel || 'index.html');
  if (!file.startsWith(DIST)) return json(res, 403, { error: 'forbidden' });
  const exists = await stat(file).then(
    (s) => s.isFile(),
    () => false,
  );
  if (!exists) file = join(DIST, 'index.html'); // SPA fallback
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'run `npm run build` first' });
  }
}

createServer(async (req, res) => {
  try {
    const { pathname, search } = new URL(req.url, 'http://x');
    if (pathname === '/api/w') return await handleApi(req, res, search);
    if (pathname.startsWith('/auth/')) return await handleAuth(req, res, pathname);
    return await serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'server_error' });
  }
}).listen(PORT, () => console.log(`CommonsFlow server on :${PORT}`));
