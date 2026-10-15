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
toolforge webservice node20 shell     # a shell inside the Node runtime: build there
  npm install && npm run build && exit

toolforge webservice node20 start
toolforge webservice node20 logs      # if it does not come up
```

`.env` is git-ignored, so `git pull` never touches it. The server loads it at start; real environment
variables (if you also set some with `toolforge envvars`) take priority over the file.

**Update:**
```bash
cd ~/www/js && git pull && npm install && npm run build && toolforge webservice node20 restart
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

## Check
Open <https://commons-flow.toolforge.org/auth/config>: it should show your client id and callback URL
(never the secret). Then log in from the home page.

## Local development
`.env` from `.env.example` (callback `http://localhost:8079/oauth/wikimedia/success`), then
`npm run server` and `npm run dev` in two terminals, and open <http://localhost:8079/>.
