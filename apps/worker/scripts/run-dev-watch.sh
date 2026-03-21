#!/usr/bin/env bash
set -euo pipefail

ENTRYPOINT="${1:-./src/index.ts}"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

if [[ "$NODE_MAJOR" -ge 25 ]]; then
  echo "[worker-dev] Node ${NODE_MAJOR} detected; using Node 22 for watch stability."
  unset npm_config_recursive
  unset npm_config_verify_deps_before_run
  exec npx -y node@22 \
    --watch-path=./src \
    --watch-path=../../packages \
    --env-file=../web/.env.local \
    --enable-source-maps \
    --import tsx \
    "$ENTRYPOINT"
fi

exec node \
  --watch-path=./src \
  --watch-path=../../packages \
  --env-file=../web/.env.local \
  --enable-source-maps \
  --import tsx \
  "$ENTRYPOINT"
