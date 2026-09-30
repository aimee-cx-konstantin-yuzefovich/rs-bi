# Production deployment

The application runs Next.js standalone with `node server.js`. Docker and the
existing PM2 host are separate supported paths; no production deployment is
performed by the development validation commands below.

## Build and artifact contract

Use the committed npm lockfile. Do not copy a macOS `node_modules` or standalone
build onto Linux: Next.js, Sharp and Prisma contain native binaries.

For the PM2 host, run `npm run build:deploy` (or `DEPLOY_ARCH=x64 bash build-deploy.sh`)
on Debian-compatible Linux with OpenSSL 3, Node 20.19+ and zip installed.
On macOS workstations, run `npm run build:deploy:docker` (via `scripts/build-deploy-docker.sh`),
which builds the Linux x64 artifact inside an official Debian Bookworm Docker container.
Use `DEPLOY_ARCH=arm64` only when both the builder and production host are arm64.
Confirm the host with `node -p process.arch`; the build runner must match. Set `DEPLOY_ARCH` in
CI environment variables. The recommended Linux build image is Debian Bookworm; Docker uses matching
Alpine build/runtime stages instead. Do not treat locally validated macOS artifacts
as Linux production artifacts.

Export `NEXT_PUBLIC_WP_LOGIN_URL` before building if it differs from the documented
default. This public value is embedded at build time. Runtime `.env` changes cannot
change it. The builder copies an explicit source set into a temporary
directory, installs with `npm ci`, generates Prisma, builds with disposable auth
values, and creates a fresh `deploy-prod.zip`. Production secrets and the Bitrix
webhook are not needed for a build. Build-only auth values are not runtime defaults.

`scripts/package-standalone.mjs` prepares `.next/deploy` after a build. It includes
`server.js`, `.next` including static assets, `public`, locked production dependencies,
generated Prisma client/engines, schema/migrations and deployment scripts. The full
production dependency graph is intentional: Next's server trace does not guarantee
that the Prisma CLI and its dependencies are available. Installation happens on the
builder; migration/startup never runs `npx` or downloads dependencies.

`sh scripts/verify-deploy-artifact.sh <artifact-root>` is the reusable artifact
contract check. Packaging runs it before accepting `.next/deploy`; deployment runs it
again after artifact transfer and extraction, before `rsync --delete`. It rejects a
missing runtime file, missing Prisma migration lock/SQL, and project `.env`,
SQLite/database or private-key files outside `node_modules`. Run
`unzip -tq` before extraction so a corrupted ZIP cannot reach production
synchronization.

No `.env*`, database files, `db/` directories or private key files belong in an
artifact. `deploy-prod.zip` is replaced atomically, never updated in place.

## Runtime environment and secrets

Use `.env.example` as documentation only. Replace both `NEXTAUTH_SECRET` and
`PROXY_SECRET` before deployment. `scripts/migrate-deploy.mjs` is the startup gate
for all supported production paths and rejects empty secrets, the disposable
build-only value and any `CHANGE_ME_*` documented placeholder before it creates a
database directory or runs Prisma migrations.

Host/PM2 standalone may bind to `HOSTNAME=127.0.0.1` behind the local reverse proxy.
Docker networking is intentionally fixed by Compose to `PORT=3000` and
`HOSTNAME=0.0.0.0`; values for those keys in `.env` cannot desynchronize the
container from its published `127.0.0.1:3000:3000` mapping or health probe.

## SQLite and the first migration deployment

SQLite holds the audit trail and used SSO nonces. Never reset it, use
`--accept-data-loss`, or delete a volume to make deployment succeed.

Host deployments must use an **absolute** `DATABASE_URL` pointing to the existing
database. The old `file:./db/audit.db` resolves relative to the Prisma schema;
the documented legacy host location is
`/var/www/www-root/data/www/bi-terminal/prisma/db/audit.db`. Inspect the live
configuration and database before changing its URL. If the live location differs,
keep that location. Check ownership/read-write access for the PM2 process account.
Both `db/` and `prisma/db/`, `.env*` and SQLite files are protected from CI rsync
deletion. Other custom database directories should live outside the application
deployment directory.

For a **new empty database**, `node scripts/migrate-deploy.mjs` creates the parent
directory and applies committed migrations. It loads production `.env` files like
Next.js; exported process variables take precedence. It rejects relative database
URLs and unsafe/missing runtime secrets before changing the database.

For **existing tables with no Prisma migration history**, manual baseline is no
longer required for known legacy states. Known legacy DB states are automatically
backed up, verified, upgraded and baselined by `scripts/migrate-deploy.mjs`:

- **State A (current schema without history)**: database contains both `audit_logs`
  and `used_nonces` with zero schema drift against `prisma/schema.prisma`. A
  transactionally consistent backup (`audit.db.pre-prisma-baseline-<timestamp>.backup`)
  is created via SQLite `VACUUM INTO`, initial migration `20260909000000_initial` is
  recorded as applied via `prisma migrate resolve`, and deployment completes.
- **State B (legacy schema without history)**: database contains only `audit_logs`
  matching the original schema and lacks `used_nonces`. An exact schema diff verifies
  the legacy structure, a `VACUUM INTO` backup is created, the missing `used_nonces`
  table is safely created, zero post-mutation drift against `prisma/schema.prisma` is
  verified, initial migration `20260909000000_initial` is recorded as applied, and
  deployment completes.

Unknown schema drift fails closed and requires manual investigation. If any
unrecognized table, missing column, or incompatible type is detected, the runner
refuses to baseline or modify the database, prints full schema diffs to stderr, and
aborts before application startup or PM2 restart.

## Existing PM2 deployment

Set production variables using `.env.example` as documentation; do not copy its
placeholder values over the live `.env`.

Before manually copying a ZIP over the live directory, validate the transfer in a
separate staging directory:

```sh
unzip -tq deploy-prod.zip
rm -rf deploy-staging && mkdir deploy-staging
unzip -q deploy-prod.zip -d deploy-staging
sh deploy-staging/scripts/verify-deploy-artifact.sh deploy-staging
```

Only after those checks pass, synchronize the staged files while strictly preserving
`.env*` and the existing database:

```sh
rsync -av --delete \
  --exclude='.env*' \
  --exclude='db/' \
  --exclude='prisma/db/' \
  --exclude='*.db*' \
  --exclude='*.sqlite*' \
  deploy-staging/ /var/www/bi-terminal/
```

Then from the application directory run the safe migration gate and restart:

```sh
NODE_ENV=production node scripts/migrate-deploy.mjs && pm2 restart bi-terminal --update-env
```

Automated deployment pipelines apply the same artifact checks, protected rsync and migration/restart
sequence automatically for main. Failed ZIP/artifact validation or failed
migrations stop the job before restart. The existing in-place rsync/PM2 deployment
is not atomic; a failure after synchronization can leave updated files on disk.
Keep a previous artifact and database backup and schedule the first baseline rollout
with writes stopped.

## Docker

Create `.env` with real secrets, then run `docker compose up -d --build`.
Compose fixes `DATABASE_URL=file:/app/db/audit.db`, `PORT=3000` and
`HOSTNAME=0.0.0.0`; `/app/db` is the persistent `bi-data` named volume owned by
UID/GID 1001 in a fresh image/volume. Existing volumes must already be writable by
that user. `docker compose down` preserves data; `docker compose down -v` does not.

Before updating an existing container, locate and back up its actual database.
Older images could use a schema-relative location outside `/app/db`. Do not destroy
that container or assume an empty volume contains its audit history. Any transfer
into the volume is a separate operator-controlled, backed-up migration; it is not
performed automatically by startup.

Startup validates runtime secrets, applies migrations, then execs `node server.js`
as the non-root user. For direct `docker run`, mount `/app/db` and supply the same
required runtime variables. The host reverse proxy connects to the published
loopback port 3000. The Caddy listener stays on port 81 and always proxies to
localhost:3000, regardless of query parameters.

`GET /api/health` returns only `{"status":"ok"}` with no caching, authentication,
CRM or database dependency. It bypasses shared API quotas but keeps security
headers. Compose runs `node scripts/healthcheck.cjs`: HTTP GET on 127.0.0.1:3000,
five-second deadline, success only on status 200. This proves process liveness,
not database/CRM availability or successful SSO. `/api/bitrix/status` remains
authenticated. Docker health status alone does not restart an unhealthy container;
the restart policy applies when its process exits.

## Vercel Development Bypass & Security Policy

`AUTH_MODE=bypass` on Vercel is request-scoped and strictly restricted to approved hosts and client IPs:

```text
AUTH BYPASS = TRUE  <=>
  1. AUTH_MODE=bypass
  2. Running on Vercel (VERCEL=1)
  3. Request hostname (normalized) strictly equals an entry in DEV_BYPASS_HOSTS
  4. Request client IP (normalized) strictly equals an entry in DEV_BYPASS_ALLOWED_IPS
```

If any condition fails, authentication fails closed and falls back to standard NextAuth / WordPress SSO.
Custom production domains (e.g. `bi.russilica.com`, `bi-terminal.rus-silica.com`) and unapproved Vercel hosts remain strictly protected by WordPress SSO.

In addition to application-level host/IP filtering, Vercel deployments are protected with Vercel Authentication / Deployment Protection (`ssoProtection.deploymentType: "all_except_custom_domains"`).

## Environment Configuration

### Real production server

```text
AUTH_MODE=wordpress
```

or omit `AUTH_MODE`, because default must be `wordpress`.

Set `BUILD_SHA` in the build/deployment environment to the exact commit being
deployed (`git rev-parse HEAD` at build time). `GET /api/health` reports it as
`buildSha` so release verification can require `production.buildSha == FINAL_SHA`.
When unset, `/api/health` truthfully reports `"unknown"` — it never fabricates
a commit.

Existing environment variables remain unchanged:
- `NEXTAUTH_SECRET`
- `PROXY_SECRET`
- `WP_LOGIN_URL`
- `BITRIX_WEBHOOK_URL`
- `DATABASE_URL`

### Vercel Development Deployment

```text
AUTH_MODE=bypass
DEV_BYPASS_HOSTS=rs-bi-git-main-constantinejozefowicz-8563s-projects.vercel.app
DEV_BYPASS_ALLOWED_IPS=<fixed user public IPv4>
NEXTAUTH_SECRET=<valid secret>
BITRIX_WEBHOOK_URL=<approved webhook>
```


## Verification

Run `npm ci`, `npm run db:generate`, `npx vitest run`, `npm run lint`, and
`npm run build` with disposable build auth values in a clean workspace.
Run `docker compose config --quiet`, `docker build .`, and container health/persistence
checks when Docker is available. Use disposable SQLite files to test fresh
migrations, baseline verification and record preservation.

Run `sh scripts/qa-deployment.sh` to repeat the lightweight deployment regression
suite. It verifies runtime-secret rejection, valid/invalid artifact cases including
missing migration SQL, and `.env`/SQLite preservation under the same rsync exclusion
rules used during deployment. The script is repository QA tooling and is not required in the
production artifact.

Deployment QA should also repeat these negative cases:

- `CHANGE_ME_*` or build-only runtime secrets must fail before migration;
- a valid ZIP missing `server.js`, Prisma CLI/schema, migration lock/SQL or static
  output must fail artifact verification before synchronization;
- project `.env`, SQLite/database or private-key files in an artifact must fail the
  verifier;
- Docker `.env` values for `PORT`/`HOSTNAME` must not override the fixed Compose
  networking contract;
- rsync exclusions must preserve `.env`, `db/` and `prisma/db/` while allowing
  ordinary stale application files to be deleted.

Follow-up work: audit the existing dependency vulnerabilities and Node 20 lifecycle,
verify the live host/platform/backup process, and consider atomic deployment plus
pinned SSH host keys. These are not dependency upgrades or infrastructure redesigns
in this stabilization patch.
