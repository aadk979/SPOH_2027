#!/usr/bin/env bash
# Runs the P03 bug reproductions with their `.skip` removed.
#
#   bash remediation/reports/P03/run-repros.sh [file-filter]
#
# Every repro asserts the correct behaviour, so before its fix each one must
# FAIL here; after the fix it passes and the fixing commit deletes its `.skip`.
# The skipped originals are never edited: unskipped copies are written next to
# them as *.unskipped.test.ts, run, and removed. Needs the local Postgres
# (scripts/dev-db-local.sh start); integration repros use spoh2027_test.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/server"

filter="${1:-}"
copies=()
cleanup() { rm -f "${copies[@]}"; }
trap cleanup EXIT

for file in tests/integration/repro/*.test.ts tests/unit/repro/*.test.ts; do
  [[ -e "$file" && "$file" != *.unskipped.test.ts ]] || continue
  [[ -z "$filter" || "$file" == *"$filter"* ]] || continue
  copy="${file%.test.ts}.unskipped.test.ts"
  sed -e 's/\bit\.skip(/it(/g' -e 's/\bdescribe\.skip(/describe(/g' "$file" > "$copy"
  copies+=("$copy")
done

[[ ${#copies[@]} -gt 0 ]] || { echo "no repro files match '$filter'"; exit 1; }

# A failing run is the expected outcome, so never let vitest's exit code stop us.
npx vitest run --reporter verbose "${copies[@]}" 2>&1 | grep -E '^\s+(✓|×|↓)|AssertionError|Test Files|Tests ' || true
