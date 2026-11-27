#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' tests/*.mjs
  exit 0
fi
failures=0
for test_file in tests/*.mjs; do
  if ! node "$test_file"; then
    failures=$((failures + 1))
  fi
done
if (( failures > 0 )); then
  printf '%s regression test files failed\n' "$failures" >&2
  exit 1
fi
