#!/usr/bin/env bash
# P01.1 automated hardcoding sweep. Re-run from the repo root:
#   bash remediation/reports/P01/sweep.sh
# Writes one raw-hit file per pattern to remediation/reports/P01/raw/ and a count table to
# remediation/reports/P01/raw/COUNTS.txt. Output is `file:line:text`, sorted, so re-runs diff cleanly.
#
# Scope: files git tracks under server/ client/ packages/ ops/ scripts/, so node_modules, dist,
# coverage, server/src/generated and Playwright output are skipped.
# infra/ does not exist on main (D-05 kept the audit branch unmerged). prisma/seed.ts and public/
# are server/prisma/seed.ts and client/public/, both inside the scope.
# Excluded: server/prisma/migrations/ (immutable SQL history; schema.prisma is swept instead) and
# package-lock.json (third-party metadata).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
OUT=remediation/reports/P01/raw
rm -rf "$OUT" && mkdir -p "$OUT"
SCOPE=(server client packages ops scripts)
EXCL='^server/prisma/migrations/|package-lock\.json$|\.(png|ico)$'

sweep() { # name, rg args… (patterns)
  local name=$1; shift
  { git ls-files -z -- "${SCOPE[@]}" | grep -z -v -E "$EXCL" \
      | xargs -0 -r rg --with-filename --no-heading --line-number --color never "$@" || true; } \
    | LC_ALL=C sort -t: -k1,1 -k2,2n >"$OUT/$name.txt"
}

# 1. Dates, years, wall-clock times
sweep 01-iso-dates   -e '20\d\d-\d\d-\d\d'
sweep 02-years       -e '202[6-9]'
sweep 03-clock-times -e '\b\d{1,2}:\d{2}\b'
# 2. Timezone markers (the plan's four, plus the SQL and Intl forms they take in practice)
sweep 04-timezone    -e 'Asia/Singapore' -e '\bSGT\b' -e '\+08' -e '8 \* 60' \
                     -e 'AT TIME ZONE' -e 'timeZone' -e 'UTC\s*\+\s*8'
# 3. Venue and brand
sweep 05-venue-brand -e 'SPOH' -e '\bT19\b' -e 'School of Computing' -e 'Open House' -e '\bSP\b'
# 4. Course codes
sweep 06-course-codes -e '\b(DAAA|DCDF|DCS|DCITP)\b'
# 5. Enum members used as literals outside their definitions (one file per enum)
enum_members() { awk -v e="$1" '$1=="enum" && $2==e {f=1; next} f && /^}/ {f=0} f && $1 ~ /^[A-Z]/ {print $1}' \
  server/prisma/schema.prisma; }
for enum in $(awk '$1=="enum" {print $2}' server/prisma/schema.prisma); do
  members=$(enum_members "$enum" | paste -sd'|')
  EXCL='^server/prisma/(migrations/|schema\.prisma$)|^packages/shared/src/enums\.ts$|package-lock\.json$|\.(png|ico)$' \
    sweep "07-enum-$enum" -e "['\"\`]($members)['\"\`]" -e "\b$enum\.($members)\b"
done
# 6. Domains, URLs, emails, AWS identifiers
sweep 08-urls-domains -e 'duckdns' -e '@spoh2027' -e 'https?://' \
                      -e '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}' \
                      -e '\b(ap|us|eu)-[a-z]+-\d\b' -e 'arn:aws' -e '\b\d{12}\b'
# 7. Magic numbers in services (reviewed by eye in P01.2)
SCOPE=(server/src/modules)
EXCL='\.test\.ts$' sweep 09-magic-numbers -e '\b\d{2,}\b'

( cd "$OUT" && for f in [0-9]*.txt; do printf '%6d  %s\n' "$(wc -l <"$f")" "${f%.txt}"; done ) >"$OUT/COUNTS.txt"
cat "$OUT/COUNTS.txt"
