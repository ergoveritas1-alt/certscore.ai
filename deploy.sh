#!/usr/bin/env bash
set -euo pipefail

echo "Scanner runtime deployment no longer happens from WC01." >&2
echo "Use the WS01 deploy flow for scanner runtime changes." >&2
echo "Use the AWS validation workflow for WC01 validation runtime changes." >&2
exit 1
