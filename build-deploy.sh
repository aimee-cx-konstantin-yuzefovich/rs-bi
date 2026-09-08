#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
repo_dir="$PWD"

# Native Node dependencies are not portable from macOS or across architectures.
node scripts/check-deploy-platform.mjs
command -v zip >/dev/null

# A clean, explicit source set prevents local .env files/databases from entering
# the build or archive. Temporary source and ZIP are removed even after failure.
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/rs-bi-build.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
# The source must be outside the checkout (Next.js workspace-root detection).
# The new ZIP must be on the destination filesystem for an atomic rename.
archive_dir=$(mktemp -d "$repo_dir/.deploy-archive.XXXXXX")
trap 'rm -rf "$work_dir" "$archive_dir"' EXIT
mkdir -p "$work_dir/source/prisma" "$work_dir/source/scripts"
for source in src public package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts; do
  cp -R "$source" "$work_dir/source/"
done
cp prisma/schema.prisma "$work_dir/source/prisma/"
cp -R prisma/migrations "$work_dir/source/prisma/"
cp scripts/package-standalone.mjs scripts/migrate-deploy.mjs scripts/healthcheck.cjs "$work_dir/source/scripts/"

cd "$work_dir/source"
export NEXTAUTH_SECRET=build-only-not-a-runtime-secret
export PROXY_SECRET=build-only-not-a-runtime-secret
export DATABASE_URL="file:$work_dir/build-only.db"
export BITRIX_WEBHOOK_URL=
export NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_WP_LOGIN_URL comes from the invoking environment, not a local .env.
NODE_ENV=development npm ci
npm run db:generate
NODE_ENV=production npm run build
node scripts/package-standalone.mjs
cd .next/deploy
zip -qr "$archive_dir/deploy-prod.zip" .
# A fresh archive replaces the previous file; zip never updates stale entries.
mv -f "$archive_dir/deploy-prod.zip" "$repo_dir/deploy-prod.zip"
