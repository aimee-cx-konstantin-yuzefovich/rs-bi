# Production deployment

The application runs Next.js standalone with `node server.js`. Docker and the
existing PM2 host are separate supported paths; no production deployment is
performed by the development validation commands below.

## Build and artifact contract

Use the committed npm lockfile. Do not copy a macOS `node_modules` or standalone
build onto Linux: Next.js, Sharp and Prisma contain native binaries.

For the PM2 host, run `DEPLOY_ARCH=x64 bash build-deploy.sh` on Debian-compatible
Linux with OpenSSL 3, Node 20.19+ and zip installed. Use `DEPLOY_ARCH=arm64` only
when both the builder and production host are arm64. Confirm the host with
`node -p process.arch`; GitFlic's build runner must match. Set `DEPLOY_ARCH` in
GitFlic CI variables. The CI build image is Debian Bookworm; Docker uses matching
Alpine build/runtime stages instead. Do not treat locally validated macOS artifacts
as Linux production artifacts.

Export `NEXT_PUBLIC_WP_LOGIN_URL` before building if it differs from the documented
default. This public value is embedded at build time. Runtime `.env` changes cannot
change it. The manual/CI builder copies an explicit source set into a temporary
directory, installs with `npm ci`, generates Prisma, builds with disposable auth
values, and creates a fresh `deploy-prod.zip`. Production secrets and the Bitrix
webhook are not needed for a build. Build-only auth values are not runtime defaults.

`scripts/package-standalone.mjs` prepares `.next/deploy` after a build. It includes
`server.js`, `.next` including static assets, `public`, locked production dependencies,
generated Prisma client/engines, schema/migrations and deployment scripts. The full
production dependency graph is intentional: Next's server trace does not guarantee
that the Prisma CLI and its dependencies are available. Installation happens on the
builder; migration/startup never runs `npx` or downloads dependencies.

No `.env*`, database files, `db/` directories or private key files belong in an
artifact. `deploy-prod.zip` is replaced atomically, never updated in place.

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
URLs and missing/build-only auth secrets before changing the database.

For **existing tables with no Prisma migration history**, complete this one-time
operator procedure before the first deploy/restart using the new migrations:

1. Stop application writes (stop the PM2 app/container). Identify the actual SQLite
   file and create a SQLite-consistent backup outside the deployment directory,
   using SQLite's `.backup` command. Include verification that the backup opens and
   contains the expected audit/nonce records. Do not copy an active WAL database as
   a single file or discard its sidecars.
2. Stage the new artifact separately. Export `DATABASE_URL` as the absolute URL of
   the existing file and `RUST_LOG=info` (Prisma 6 requires its startup log when
   parsing connection errors). Run the packaged CLI against this file:
   `node node_modules/prisma/build/index.js migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`.
   Exit 0 means no schema differences; exit 2 or any error means stop and investigate.
3. Only after backup and an exact schema match, run
   `node node_modules/prisma/build/index.js migrate resolve --applied 20260909000000_initial --schema prisma/schema.prisma`.
   This records the baseline without recreating tables. Never mark an incompatible
   schema applied. If migration history already exists, inspect it instead of
   repeating this procedure.
4. Run `NODE_ENV=production node scripts/migrate-deploy.mjs`, check that audit/nonce
   records remain intact, then restart. No automatic baselining is implemented.

## Existing PM2 and GitFlic deployment

Set production variables using `.env.example` as documentation; do not copy its
placeholder values over the live `.env`. Unpack the ZIP into the existing app
directory, keeping `.env*` and the database. From that directory run:

```sh
NODE_ENV=production node scripts/migrate-deploy.mjs && pm2 restart bi-terminal --update-env
```

The existing PM2 app must run `server.js` from this directory under Node with
`NODE_ENV=production`. GitFlic performs the same migration/restart sequence after
rsync and deploys only main/master. Failed migrations stop the command before
restart. The existing in-place rsync/PM2 deployment is not atomic; a failed deploy
can leave updated files on disk. Keep a previous artifact and database backup and
schedule the first baseline rollout with writes stopped.

## Docker

Create `.env` with real secrets, then run `docker compose up -d --build`.
Compose fixes `DATABASE_URL=file:/app/db/audit.db`; `/app/db` is the persistent
`bi-data` named volume owned by UID/GID 1001 in a fresh image/volume. Existing volumes
must already be writable by that user. `docker compose down` preserves data;
`docker compose down -v` does not.

Before updating an existing container, locate and back up its actual database.
Older images could use a schema-relative location outside `/app/db`. Do not destroy
that container or assume an empty volume contains its audit history. Any transfer
into the volume is a separate operator-controlled, backed-up migration; it is not
performed automatically by startup.

Startup applies migrations, then execs `node server.js` as the non-root user. For
direct `docker run`, mount `/app/db` and supply the same required runtime variables.
The host reverse proxy connects to the published loopback port 3000. The Caddy
listener stays on port 81 and always proxies to localhost:3000, regardless of query
parameters.

`GET /api/health` returns only `{"status":"ok"}` with no caching, authentication,
CRM or database dependency. It bypasses shared API quotas but keeps security
headers. Compose runs `node scripts/healthcheck.cjs`: HTTP GET on 127.0.0.1:3000,
five-second deadline, success only on status 200. This proves process liveness,
not database/CRM availability or successful SSO. `/api/bitrix/status` remains
authenticated. Docker health status alone does not restart an unhealthy container;
the restart policy applies when its process exits.

## Verification

Run `npm ci`, `npm run db:generate`, `npx vitest run`, `npm run lint`, and
`npm run build` with disposable build auth values in a clean workspace.
Run `docker compose config --quiet`, `docker build .`, and container health/persistence
checks when Docker is available. Use disposable SQLite files to test fresh
migrations, baseline verification and record preservation. Smoke-test the isolated
artifact and its packaged migration CLI, including the exact health probe.

Follow-up work: audit the existing dependency vulnerabilities and Node 20 lifecycle,
verify the live host/platform/backup process, and consider atomic deployment plus
pinned SSH host keys. These are not dependency upgrades or infrastructure redesigns
in this stabilization patch.
