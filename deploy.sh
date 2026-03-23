#!/usr/bin/env bash
set -euo pipefail

echo "Scanner runtime deployment no longer happens from WC01." >&2
echo "Use the WS01 GCP deploy flow for scanner runtime changes." >&2
echo "Use ./deploy-validation.sh for the WC01 validation worker." >&2
exit 1
