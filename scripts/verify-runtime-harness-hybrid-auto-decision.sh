#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
exec pnpm --filter @website-signal-risk-scanner/runtime-harness verify:hybrid-auto-decision
