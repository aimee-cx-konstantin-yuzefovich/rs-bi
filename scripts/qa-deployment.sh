#!/bin/sh
set -eu

repo=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$repo"
verifier="$repo/scripts/verify-deploy-artifact.sh"

fail() { echo "deployment QA failed: $*" >&2; exit 1; }
expect_fail() {
  label=$1
  shift
  if "$@" >/dev/null 2>&1; then fail "$label unexpectedly passed"; fi
  echo "$label: PASS"
}

node --input-type=module <<'NODE'
import { assertRuntimeSecrets } from './scripts/runtime-env.mjs';
const cases = [
  [{ NEXTAUTH_SECRET: 'CHANGE_ME_RUN_OPENSSL_RAND_BASE64_32', PROXY_SECRET: 'real' }, false, 'placeholder NEXTAUTH_SECRET'],
  [{ NEXTAUTH_SECRET: 'real', PROXY_SECRET: 'CHANGE_ME_MATCH_WORDPRESS_SSO_SECRET' }, false, 'placeholder PROXY_SECRET'],
  [{ NEXTAUTH_SECRET: 'build-only-not-a-runtime-secret', PROXY_SECRET: 'real' }, false, 'build placeholder'],
  [{ NEXTAUTH_SECRET: 'real-a', PROXY_SECRET: 'real-b' }, true, 'real secrets'],
];
for (const [env, expected, label] of cases) {
  let ok = true;
  try { assertRuntimeSecrets(env); } catch { ok = false; }
  if (ok !== expected) throw new Error(`${label}: expected ${expected}, got ${ok}`);
  console.log(`${label}: PASS`);
}
NODE

command -v rsync >/dev/null 2>&1 || fail "rsync is required for the deployment-state preservation test"
work=$(mktemp -d "${TMPDIR:-/tmp}/rs-bi-deploy-qa.XXXXXX")
trap 'rm -rf "$work"' EXIT
make_fixture() {
  root=$1
  rm -rf "$root"
  mkdir -p "$root/.next/static" "$root/public" "$root/prisma/migrations/20260909000000_initial" \
    "$root/scripts" "$root/node_modules/prisma/build" "$root/node_modules/.prisma/client"
  for f in server.js .next/BUILD_ID package.json package-lock.json prisma/schema.prisma \
    prisma/migrations/migration_lock.toml prisma/migrations/20260909000000_initial/migration.sql \
    scripts/migrate-deploy.mjs scripts/runtime-env.mjs scripts/healthcheck.cjs scripts/verify-deploy-artifact.sh \
    node_modules/prisma/build/index.js node_modules/.prisma/client/schema.prisma; do
    : > "$root/$f"
  done
}

make_fixture "$work/good"
sh "$verifier" "$work/good" >/dev/null || fail "valid fixture rejected"
echo "valid artifact: PASS"

cp -R "$work/good" "$work/missing-server"
rm "$work/missing-server/server.js"
expect_fail "missing server.js" sh "$verifier" "$work/missing-server"

cp -R "$work/good" "$work/missing-migration"
rm "$work/missing-migration/prisma/migrations/20260909000000_initial/migration.sql"
expect_fail "missing migration.sql" sh "$verifier" "$work/missing-migration"

cp -R "$work/good" "$work/secret"
printf secret > "$work/secret/.env.production"
expect_fail "embedded .env" sh "$verifier" "$work/secret"

cp -R "$work/good" "$work/sqlite"
mkdir "$work/sqlite/db"
: > "$work/sqlite/db/audit.db"
expect_fail "embedded SQLite" sh "$verifier" "$work/sqlite"

src="$work/rsync-src"
dst="$work/rsync-dst"
mkdir -p "$src" "$dst/prisma/db" "$dst/db"
printf new > "$src/server.js"
printf secret > "$dst/.env"
printf audit > "$dst/prisma/db/audit.db"
printf audit > "$dst/db/audit.db"
printf stale > "$dst/stale.txt"
rsync -a --delete --exclude='.env*' --exclude='db/' --exclude='*.db*' --exclude='*.sqlite*' "$src/" "$dst/" >/dev/null 2>&1 || fail "rsync preservation simulation failed"
[ -f "$dst/.env" ] && [ -f "$dst/prisma/db/audit.db" ] && [ -f "$dst/db/audit.db" ] || fail "protected runtime state was deleted"
[ ! -e "$dst/stale.txt" ] || fail "ordinary stale file was not deleted"
echo "rsync SQLite/.env protection: PASS"

echo "deployment QA: PASS"
