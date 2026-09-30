#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
repo_dir="$PWD"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker CLI is not installed or not in PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker daemon is not reachable." >&2
  echo "If using Colima on macOS, start it with: colima start" >&2
  echo "If using Docker Desktop, make sure it is running." >&2
  exit 1
fi

target_arch="${DEPLOY_ARCH:-x64}"
if [ "$target_arch" = "x64" ]; then
  docker_platform="linux/amd64"
elif [ "$target_arch" = "arm64" ]; then
  docker_platform="linux/arm64"
else
  echo "Error: Unsupported DEPLOY_ARCH: $target_arch. Must be x64 or arm64." >&2
  exit 1
fi

echo "==> Building Linux ($target_arch) production artifact in isolated Docker container ($docker_platform)..."

host_uid="$(id -u)"
host_gid="$(id -g)"

docker run --rm \
  --platform "$docker_platform" \
  --dns 8.8.8.8 --dns 1.1.1.1 \
  -e DEPLOY_ARCH="$target_arch" \
  -v "$repo_dir:/workspace" \
  -v /workspace/node_modules \
  -v /workspace/.next \
  -w /workspace \
  node:20-bookworm \
  bash -c "set -euo pipefail
    git config --global --add safe.directory /workspace
    apt-get update -qq && apt-get install -y -qq zip rsync >/dev/null
    echo '==> Installing Linux dependencies for QA...'
    npm ci
    echo '==> Running build-deploy.sh...'
    bash build-deploy.sh
    chown \"$host_uid:$host_gid\" deploy-prod.zip
  "

echo "==> Production artifact build complete: deploy-prod.zip"
