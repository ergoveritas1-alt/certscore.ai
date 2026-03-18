#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="${CERTSCORE_WORKTREE_ROOT:-/tmp/wc01-product-scan-ui}"

exec bash "${ROOT_DIR}/scripts/run-worktree-web-dev.sh" "$WORKTREE_ROOT" "3000" "certscore" "apps/web"
