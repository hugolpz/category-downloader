# Deploying commons-flow on Toolforge

Target: <https://commons-flow.toolforge.org/> (Toolforge build service, Node buildpack).
Commands below follow the Toolforge docs from memory; check `toolforge --help` / wikitech if one has changed.

## 1. One-time setup
1. Create the tool `commons-flow` at <https://toolsadmin.wikimedia.org/> and add co-maintainers.
2. Register a **production** OAuth 2.0 consumer on Meta (a consumer has one callback URL, so it cannot be shared with dev):
   - Confidential client, callback `https://commons-flow.toolforge.org/`
   - Grants: basic + high-volume (bot) access; applicable project: `commons.wikimedia.org`
3. The build service builds from a **public git repo whose root is this folder** (`package.json` + `Procfile`).
   This folder currently lives inside the LinguaLibre_data repo, so give it its own repo first.

## 2. Configure (on `login.toolforge.org`, after `become commons-flow`)
```
toolforge envvars create OAUTH_CLIENT_ID <client id>
toolforge envvars create OAUTH_CLIENT_SECRET <client secret>
toolforge envvars create OAUTH_REDIRECT_URI https://commons-flow.toolforge.org/
toolforge envvars create CONTACT <url or email for the User-Agent>
```
Settings are read at runtime by `server/index.mjs`; nothing secret is in the build.

## 3. Build and start
```
toolforge build start <git url of the repo>
toolforge build show                 # wait for success
toolforge webservice buildservice start
```
The buildpack runs `npm install` and `npm run build`, then starts the `Procfile` command
(`node server/index.mjs`) on `$PORT`.

## 4. Update
Push to the repo, then `toolforge build start <git url>` and `toolforge webservice restart`.

## Local development
`.env` from `.env.example` (callback `http://localhost:8079/oauth/wikimedia/success`), then
`npm run server` and `npm run dev` in two terminals, and open <http://localhost:8079/>.
