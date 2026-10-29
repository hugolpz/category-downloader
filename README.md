# CategoryDownloader

[![CI](https://github.com/hugolpz/category-downloader/actions/workflows/ci.yml/badge.svg)](https://github.com/hugolpz/category-downloader/actions/workflows/ci.yml)

Download a whole [Wikimedia Commons](https://commons.wikimedia.org/) category (up to 500,000+ files) straight into a folder on your computer, with their metadata and licenses. If anything goes wrong (closed tab, crash, lost connection, expired login) it resumes exactly where it stopped.

It runs in the browser: files go directly from Wikimedia to your disk, nothing is uploaded anywhere else.

- Live: <https://category-downloader.toolforge.org/> (Toolforge)
- Browser: Chromium-based (Chrome, Edge, …). It needs the [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API) to write into a chosen folder.

## Features

- Log in with your Wikimedia account (OAuth 2.0, authorization code + PKCE).
- Pick a category, optionally with its level-1 subcategories (with file counts). The table lists the top category too, so its own files can be included or left out.
- Streams every file to disk with a small concurrency pool and a polite delay; retries with backoff, honours `Retry-After`.
- Crash-safe resume: progress is saved in IndexedDB, files are committed atomically (no half-written files).
- Metadata saved as NDJSON, plus a `.json` next to every file (always on): contributors must be credited via backlink, user's name and license, and the `.json` holds all three. A generated `README.md` goes in every download folder.
- The address is the form: `/Category:Lingua_Libre_pronunciation-sru` opens with the category filled in, and a successful Check moves the address there, so the link is always the one to share.
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
- Callback URL: `http://localhost:8079/oauth/wikimedia/success` for development, `https://category-downloader.toolforge.org/` in production. A consumer has a single callback, so use one consumer per environment.
- Put the key and secret in `.env` (see `.env.example`). The secret stays on the server and never reaches the browser.

## Scripts

| Command                           | What it does                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server on port 8079 (proxies `/auth` and `/api` to the server) |
| `npm run server`                  | Node server: login, token refresh and an API relay, reading `.env`      |
| `npm run build`                   | Production build into `dist/`                                           |
| `npm start`                       | Serve `dist/` and the auth routes (what Toolforge runs)                 |
| `npm test`                        | Unit tests (Vitest)                                                     |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                       |

Deployment: see [DEPLOY.md](DEPLOY.md). Pushes to `main` that pass CI are deployed to Toolforge automatically (signed upload, no SSH keys).

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
- **Queue:** rows are keyed by listing position. A small counters row stores the number done/failed and a _low-water mark_ (the lowest position not yet finished). A restart rescans from there and skips what is already done. Earlier designs that counted rows by a status index took seconds at 100k rows; this one stays in milliseconds at any size.
- **Files:** written through the File System Access API, which commits on `close()`; the size is checked before committing, so a short read leaves nothing behind.
- **API calls:** go through our server (Commons does not send CORS headers for arbitrary origins), which also sets a proper `User-Agent`. File downloads go straight from `upload.wikimedia.org`.

## The page and its URLs

Everything is one page ([src/views/WorkspaceView.vue](src/views/WorkspaceView.vue)) with three steps that never swap out:

1. **Which category?** type it (with suggestions), press **Check**, optionally include subcategories.
2. **Where should the files go?** pick a folder and start.
3. **Watch it download.** The summary cards, "Just saved / Up next", failures and the finish summary. Until you start, this step shows a placeholder.

A router ([src/router/index.js](src/router/index.js), history mode) only keeps the address in step with the form. The server answers any
unknown GET path with the app, so every link below also works when typed or reloaded.

| URL                                                                                     | Page                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                     | The page with no category yet: type one and press **Check**; the address then becomes `/Category:…`                                                                                                                                                                                                                 |
| `/Category:<title>`                                                                     | The same page with that Commons category in the field, e.g. `/Category:Lingua_Libre_pronunciation-sru` (same spelling as Commons; titles may contain `( ) / %` and accents). **Opening it fills the category field**, and shows that category's download in step 3 if this browser has one. It is the link to share |
| `/Category:<title>?cats=Category:<title>\|Category:<title>/Sub&delay=500&concurrency=2` | The same, with options. **`cats` is the list of categories to download**: with no `cats`, just the top category; with `cats`, exactly those, and the top category's own files are included **only if its title is in the list** (leave it out to download only subcategories). Only non-default options appear      |
| `/?category=<title>`, `?subcats=A\|B`                                                   | Old links: redirected to `/Category:<title>` and `?cats=` (old `subcats` links always included the top category, so it is added to the list)                                                                                                                                                                        |
| anything else                                                                           | "This page does not exist"                                                                                                                                                                                                                                                                                          |

Step 3 is **per category**. Everything it shows (the summary cards, "Just saved", "Up next", failures) is saved in the browser with each
download, including how long it actually ran across all its pauses and reloads (for "Average speed" and "Time taken"). Change the category in
the field, by typing, picking a suggestion or opening another address, and step 3 loads that category's last stats, or shows its resting
placeholder if nothing was downloaded for it here. Reload the page and the stats are still there.

Pressing **Start** (or **Resume**) scrolls the page to step 3 and moves keyboard focus to its heading, because the dashboard sits below the setup. People who prefer reduced motion get a jump instead of a smooth scroll.

While a download runs, step 3 always shows it (there is one dashboard), whatever category the form above is on, and **Start** is disabled
until it finishes or is paused; you can prepare the next one meanwhile.

The login callback (`/oauth/wikimedia/success?code=…`, or the site root) has no page of its own: a router guard
finishes the login and sends you back to where you were. Starting or resuming a download moves the address to `/Category:<title>`.
The URL shapes live in [src/router/index.js](src/router/index.js) (paths) and [src/utils/urlParams.js](src/utils/urlParams.js) (the options in the query).

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

| Area            | Examples                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page            | `workspace-view`, `step-download`, `step-download-title`, `step-download-placeholder`, `running-note`, `progress-category`, `not-found`                                                                                                                                                                         |
| Header / footer | `app-header`, `brand-link`, `bot-speed-badge`, `login-button`, `logout-button`, `user-name`, `app-footer`, `author-link`                                                                                                                                                                                        |
| Welcome page    | `hero-intro`, `hero-title`, `hero-login-button`, `hero-steps`, `hero-step-1`                                                                                                                                                                                                                                    |
| Setup           | `category-input`, `category-check-button`, `category-summary`, `include-subcategories-checkbox`, `subcategory-list`, `top-category-option`, `top-category-badge`, `subcategory-option-0`, `nothing-selected-hint`, `start-button`, `share-link-button`, `sidecars-checkbox`, `delay-input`, `concurrency-input` |
| Resume          | `resume-prompt`, `resume-prompt-resume-button`, `resume-prompt-discard-button`                                                                                                                                                                                                                                  |
| Progress        | `progress-panel`, `progress-title`, `progress-counter`, `progress-bar`, `pause-button`, `progress-resume-button`, `finish-banner`, `stats-grid`, `stat-speed`, `stat-time-left`, `rolling-log`, `recent-log`, `upcoming-log`, `readme-viewer`                                                                   |
| Failures        | `failed-list`, `retry-failed-button`, `export-errors-button`                                                                                                                                                                                                                                                    |

When you add an element worth targeting, follow the same pattern. Repeated elements get an index suffix (`subcategory-option-3`).

## Contributing

It is plain JavaScript (no TypeScript, no build step for types). Data shapes are documented with JSDoc in `src/engine/types.js`. Before opening a pull request, please run `npm test` and `npm run lint`. The most valuable tests are the ones around resume and failure, in `tests/downloader.test.js` and `tests/enumerator.test.js`.

### Translating

The interface is translated with [Banana](https://github.com/wikimedia/banana-i18n) message files, the format of translatewiki.net: `src/i18n/en.json` is the source, `qqq.json` explains every message to translators, and `ar`, `es`, `fr`, `hi`, `id`, `pt`, `sw`, `uk`, `zh` are the other languages (the machine-made ones deserve a native speaker's review). The pencil icon beside the language selector opens the selected language's file for editing on GitHub. To add a language, add `src/i18n/<code>.json` and one line to `LANGUAGES` in `src/i18n/index.js`. Messages use `$1` parameters and `{{PLURAL:$1|one|other}}`; the page language can also be forced with `?uselang=fr`. The generated README written into download folders stays English.

Ideas welcome: Firefox/Safari support (chunked ZIP fallback), dark mode.

---

Made by [Hugo Lopez](https://github.com/hugolpz).
