#!/bin/sh
set -eu

root=${1:-.}
fail() {
  echo "artifact verification failed: $*" >&2
  exit 1
}

[ -d "$root" ] || fail "root does not exist: $root"

required_files='server.js
.next/BUILD_ID
package.json
package-lock.json
prisma/schema.prisma
prisma/migrations/migration_lock.toml
scripts/migrate-deploy.mjs
scripts/runtime-env.mjs
scripts/healthcheck.cjs
scripts/verify-deploy-artifact.sh
node_modules/prisma/build/index.js
node_modules/.prisma/client/schema.prisma'
required_dirs='.next/static
public
prisma/migrations'

printf '%s\n' "$required_files" | while IFS= read -r path; do
  [ -f "$root/$path" ] || fail "missing required file: $path"
done
printf '%s\n' "$required_dirs" | while IFS= read -r path; do
  [ -d "$root/$path" ] || fail "missing required directory: $path"
done

migration_sql=$(find "$root/prisma/migrations" -mindepth 2 -maxdepth 2 -type f -name migration.sql -print -quit)
[ -n "$migration_sql" ] || fail "no migration.sql found under prisma/migrations"

leak=$(find "$root" -path "$root/node_modules" -prune -o -type f \( \
  -name '.env' -o -name '.env.*' -o \
  -name '*.db' -o -name '*.db-*' -o \
  -name '*.sqlite' -o -name '*.sqlite-*' -o -name '*.sqlite3' -o -name '*.sqlite3-*' -o \
  -name '*.pem' -o -name '*.key' \
\) -print -quit)
[ -z "$leak" ] || fail "forbidden sensitive/runtime file present: ${leak#"$root"/}"

db_dir=$(find "$root" -path "$root/node_modules" -prune -o -type d -name db -print -quit)
[ -z "$db_dir" ] || fail "forbidden runtime db directory present: ${db_dir#"$root"/}"

echo "artifact verification: ok"
