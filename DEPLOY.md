# Deploying commons-flow on Toolforge

Target: <https://commons-flow.toolforge.org/>.
Commands follow the Toolforge docs from memory; check `toolforge webservice --help` / wikitech if one has changed.

## Prerequisites
1. The tool `commons-flow` exists at <https://toolsadmin.wikimedia.org/>.
2. A **production** OAuth 2.0 consumer on Meta (a consumer has a single callback URL, so dev and production need one each):
   confidential, callback `https://commons-flow.toolforge.org/`, grants basic + high-volume (bot) access.
3. The code is in a public git repo, e.g. <https://github.com/hugolpz/commons-flow>.

## Option A (recommended): code in your tool's home, editable `.env`

The app runs from `~/www/js` and reads `~/www/js/.env`, which you can see and edit with nano.

```bash
become commons-flow
mkdir -p ~/www/js && cd ~/www/js
git clone https://github.com/hugolpz/commons-flow .      # the folder must be empty

cp .env.example .env
nano .env                  # OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI, CONTACT, PORT=8000
chmod 600 .env             # only you can read the secret

toolforge webservice --help           # pick a Node type >= 20 (e.g. node20)
toolforge webservice node20 shell     # a shell inside the Node runtime (it starts in ~, so cd first)
  cd ~/www/js && npm install && npm run build && exit

toolforge webservice node20 start
toolforge webservice node20 logs      # if it does not come up
```

`.env` is git-ignored, so `git pull` never touches it. The server loads it at start; real environment
variables (if you also set some with `toolforge envvars`) take priority over the file.

**Update by hand** (only if you are not using the automatic deploy below; `npm` exists only inside the Node container, not on the login server):
```bash
cd ~/www/js && git pull
toolforge webservice node20 shell     # then, inside it:
  cd ~/www/js && npm install && npm run build && exit
toolforge webservice node20 restart
```
Edit `.env`? Just `toolforge webservice node20 restart` afterwards.

## Option B: build service (no files on the server)

Builds a container image from the git repo; settings are Toolforge environment variables, not a file.
```bash
toolforge envvars create OAUTH_CLIENT_ID          # each prompts for the value
toolforge envvars create OAUTH_CLIENT_SECRET
toolforge envvars create OAUTH_REDIRECT_URI
toolforge envvars create CONTACT
toolforge build start https://github.com/hugolpz/commons-flow
toolforge build show
toolforge webservice buildservice start
```
The buildpack runs `npm install` and `npm run build`, then the `Procfile` (`node server/index.mjs`).

## Automatic deploy from GitHub (recommended once Option A works)

Every push to `main` that passes CI deploys itself. There is **no SSH key and no Toolforge password**
in GitHub: the workflow (`deploy` job in `.github/workflows/ci.yml`) builds the app, packs `dist/` and
`server/` into a tarball and uploads it to your running service, signed with a shared secret (HMAC). The server
checks the signature, validates the archive, swaps the files in, restarts and reports its version; the job waits
until `/version` shows the new commit. Production needs no `git`, `npm` or `node_modules` for this.

**One-time setup**

1. Generate a secret: `openssl rand -hex 32`.
2. On Toolforge, add it to `~/www/js/.env`:
   ```
   DEPLOY_SECRET=<the secret>
   ```
3. Put the deploy code on the server **once by hand** (the version running now does not have `/deploy` yet), using the
   manual update above, then `toolforge webservice node20 restart`.
4. On GitHub, Settings → Environments → New environment `production`. Add:
   - secret `DEPLOY_SECRET` = the same value
   - variable `DEPLOY_URL` = `https://commons-flow.toolforge.org` (no trailing slash)
   - optional: "Required reviewers" if you want to approve each deploy.
5. Push to `main`. Watch the run under the Actions tab.

From then on, do not `git pull` in `~/www/js`: deploys overwrite `dist/` and `server/` there.
`.env` is never touched, and the previous release is kept in `.deploy/prev/` for a manual rollback
(`mv` the folders back and restart).

**Safety:** without `DEPLOY_SECRET` the `/deploy` endpoint does not exist (404). Requests need a valid HMAC and a
timestamp under 5 minutes old (no replay). The archive is listed before extraction and must contain only regular
files under `dist/` and `server/` (no symlinks, absolute or `..` paths). One deploy runs at a time.
To turn it off, empty `DEPLOY_SECRET` in `.env` and restart. To rotate the secret, change it in both places.

## Check
Open <https://commons-flow.toolforge.org/auth/config>: it should show your client id and callback URL
(never the secret). Then log in from the home page.

## Local development
`.env` from `.env.example` (callback `http://localhost:8079/oauth/wikimedia/success`), then
`npm run server` and `npm run dev` in two terminals, and open <http://localhost:8079/>.
