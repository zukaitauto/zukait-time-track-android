#!/usr/bin/env bash
set -euo pipefail
# Playwright 1.58.2 Noble ships Chromium, WebKit and their OS dependencies.
# Keep test execution/read-only fixtures on the checked-out workspace, not production.
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/ci-browser-via-image.sh <command> [arguments...]" >&2
  exit 2
fi
docker run --rm --ipc=host --network host \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp --env CI=true \
  --volume "$PWD:/work" --workdir /work \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  "$@"
