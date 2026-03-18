#!/usr/bin/env bash
set -euo pipefail

exec gcloud auth login "$@"
