#!/usr/bin/env bash
# Runs the P03 bug reproductions with their `.skip` removed.
#
#   bash remediation/reports/P03/run-repros.sh [file-filter]
#
# Every repro asserts the correct behaviour, so before its fix each one must
# FAIL here; after the fix it passes and the fixing commit deletes its `.skip`.
# The skipped originals are never edited: unskipped copies are written next to
# them as *.unskipped.test.ts, run, and removed. Server repros need the local
# Postgres (scripts/dev-db-local.sh start) and use spoh2027_test.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
filter="${1:-}"
copies=()
cleanup() { rm -f "${copies[@]}"; }
trap cleanup EXIT

# Unskipped copies of the matching repro files in one workspace, run there.
run_workspace() {
  local workspace="$1" dir="$2" batch=()
  for file in "$root/$workspace/$dir"/*.test.ts; do
    [[ -e "$file" && "$file" != *.unskipped.test.ts ]] || continue
    [[ -z "$filter" || "$file" == *"$filter"* ]] || continue
    local copy="${file%.test.ts}.unskipped.test.ts"
    sed -e 's/\bit\.skip(/it(/g' -e 's/\bdescribe\.skip(/describe(/g' "$file" > "$copy"
    copies+=("$copy")
    batch+=("${copy#"$root/$workspace/"}")
  done
  [[ ${#batch[@]} -gt 0 ]] || return 0
  echo "── $workspace"
  # A failing run is the expected outcome, so never let vitest's exit code stop us.
  (cd "$root/$workspace" && npx vitest run --reporter verbose "${batch[@]}" 2>&1 |
    grep -E '^\s+(✓|×|↓)|AssertionError|Test Files|Tests ') || true
}

run_workspace server tests/integration/repro
run_workspace server tests/unit/repro
run_workspace client tests/repro

[[ ${#copies[@]} -gt 0 ]] || { echo "no repro files match '$filter'"; exit 1; }
