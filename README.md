# CommonsFlow

Download a whole [Wikimedia Commons](https://commons.wikimedia.org/) category (up to 500,000+ files) straight into a folder on your computer, with their metadata and licenses. If anything goes wrong (closed tab, crash, lost connection, expired login) it resumes exactly where it stopped.

It runs in the browser: files go directly from Wikimedia to your disk, nothing is uploaded anywhere else.

- Live: <https://commons-flow.toolforge.org/> (Toolforge)
- Browser: Chromium-based (Chrome, Edge, …). It needs the [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API) to write into a chosen folder.

## Features

- Log in with your Wikimedia account (OAuth 2.0, authorization code + PKCE).
- Pick a category, optionally with its level-1 subcategories (with file counts).
- Streams every file to disk with a small concurrency pool and a polite delay; retries with backoff, honours `Retry-After`.
- Crash-safe resume: progress is saved in IndexedDB, files are committed atomically (no half-written files).
- Metadata saved as NDJSON, plus a `.json` next to every file (always on): contributors must be credited via backlink, user's name and license, and the `.json` holds all three. A generated `README.md` goes in every download folder.
- Prefill the form from the URL and share the link: `?category=…&subcats=A|B`.
- Shows whether your account has "bot speed" (high API limits) and adapts.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env     # then fill in your OAuth consumer, see below
npm run server           # terminal 1: login + API relay on :8787
npm run dev              # terminal 2: the app on http://localhost:8079/
```

### OAuth consumer

Register a **confidential** OAuth 2.0 consumer on Meta: <https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2>

- Grants: basic rights, plus high-volume (bot) access if you want bot speed.
- Callback URL: `http://localhost:8079/oauth/wikimedia/success` for development, `https://commons-flow.toolforge.org/` in production. A consumer has a single callback, so use one consumer per environment.
- Put the key and secret in `.env` (see `.env.example`). The secret stays on the server and never reaches the browser.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 8079 (proxies `/auth` and `/api` to the server) |
| `npm run server` | Node server: login, token refresh and an API relay, reading `.env` |
| `npm run build` | Production build into `dist/` |
| `npm start` | Serve `dist/` and the auth routes (what Toolforge runs) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

Deployment: see [DEPLOY.md](DEPLOY.md).

## How it works

```
Vue 3 UI (Codex + Tailwind)  ──Comlink──▶  Engine in a Web Worker
                                              ├─ enumerator   category listing → IndexedDB
                                              ├─ downloader   N parallel streams → your folder
                                              └─ metadata / README writers
server/index.mjs: static files, OAuth (holds the client secret), relay to the Commons API
```

Why it resumes correctly:

- **Listing:** the API's `cmcontinue` cursor is saved in the same IndexedDB transaction as that page's file rows, so the cursor is never ahead of the data.
- **Queue:** rows are keyed by listing position. A small counters row stores the number done/failed and a *low-water mark* (the lowest position not yet finished). A restart rescans from there and skips what is already done. Earlier designs that counted rows by a status index took seconds at 100k rows; this one stays in milliseconds at any size.
- **Files:** written through the File System Access API, which commits on `close()`; the size is checked before committing, so a short read leaves nothing behind.
- **API calls:** go through our server (Commons does not send CORS headers for arbitrary origins), which also sets a proper `User-Agent`. File downloads go straight from `upload.wikimedia.org`.

## Project layout

```
server/index.mjs        OAuth, API relay, static hosting (no dependencies)
src/auth, src/api       login (PKCE) and the Commons API client
src/engine/             the download engine (worker): enumerator, downloader, db, paths, README, …
src/engine/types.js     JSDoc definitions of the data shapes (start reading here)
src/stores/             Pinia stores (auth, setup form, job, progress)
src/components/         atoms / molecules / organisms
src/styles/theme.css    colours, fonts, Codex overrides
src/dev/                scale-test harness (open /scale.html in dev)
tests/                  Vitest unit tests (fake IndexedDB, in-memory file sink)
```

The README that is written into each download folder comes from [src/engine/readme.template.md](src/engine/readme.template.md): plain Markdown, easy to edit.

## UI element ids

Every meaningful element has a stable, human-readable `id` (about 75 of them) for styling hooks, anchors and end-to-end tests.
Convention: lowercase kebab-case, `<area>-<element>[-<kind>]`, unique on the page.

| Area | Examples |
|---|---|
| Header / footer | `app-header`, `brand-link`, `bot-speed-badge`, `login-button`, `logout-button`, `user-name`, `app-footer`, `author-link` |
| Welcome page | `hero-intro`, `hero-title`, `hero-login-button`, `hero-steps`, `hero-step-1` |
| Setup | `category-input`, `category-check-button`, `category-summary`, `include-subcategories-checkbox`, `subcategory-list`, `subcategory-option-0`, `start-button`, `share-link-button`, `sidecars-checkbox`, `delay-input`, `concurrency-input` |
| Resume | `resume-prompt`, `resume-prompt-resume-button`, `resume-prompt-discard-button` |
| Progress | `progress-panel`, `progress-title`, `progress-counter`, `progress-bar`, `pause-button`, `progress-resume-button`, `finish-banner`, `stats-grid`, `stat-speed`, `stat-time-left`, `rolling-log`, `recent-log`, `upcoming-log`, `readme-viewer` |
| Failures | `failed-list`, `retry-failed-button`, `export-errors-button` |

When you add an element worth targeting, follow the same pattern. Repeated elements get an index suffix (`subcategory-option-3`).

## Contributing

It is plain JavaScript (no TypeScript, no build step for types). Data shapes are documented with JSDoc in `src/engine/types.js`. Before opening a pull request, please run `npm test` and `npm run lint`. The most valuable tests are the ones around resume and failure, in `tests/downloader.test.js` and `tests/enumerator.test.js`.

Ideas welcome: Firefox/Safari support (chunked ZIP fallback), dark mode, more languages.

---

Made by [Hugo Lopez](https://github.com/hugolpz).
