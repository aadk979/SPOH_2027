#!/usr/bin/env bash
#
# Full API smoke test against a deployed environment.
#
# Exists because a deploy was handed over with every read path verified and no
# write path exercised at all — and the first write a human attempted returned
# "Something went wrong". Reads pass on a box with no AWS credentials; the
# provisioning path is the only thing that proves Cognito admin access works.
#
# Read-only except for one volunteer create/update/deactivate, which it cleans
# up. Point it at the live box only when you mean to: it writes audit rows.
#
#   BASE="${BASE:-https://spoh2027.duckdns.org}" ./infra/scripts/smoke-test.sh
#
set -uo pipefail

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

BASE="${BASE:-https://spoh2027.duckdns.org}"
POOL=ap-southeast-1_9bwl2nGF7
CLIENT=23uft7mvtnrno1uunsc5lp0h2v
REGION=ap-southeast-1
SMOKE_USER="${SMOKE_USER:-chief@spoh2027.test}"
PW="${SMOKE_PASSWORD:?set SMOKE_PASSWORD}"
PASS=0; FAIL=0
declare -a FAILURES

hdr() { printf '\n\033[1m%s\033[0m\n' "$*"; }

check() { # check <expected-codes-csv> <method> <path> [body]
  local expect=$1 method=$2 path=$3 body=${4:-}
  local args=(-s -m 30 -o "$TMP/body.json" -w '%{http_code}'
              -X "$method" "$BASE$path"
              -H "Authorization: Bearer $AT"
              -H "Origin: $BASE")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  local code; code=$(curl "${args[@]}")
  if [[ ",$expect," == *",$code,"* ]]; then
    printf '  \033[32mok\033[0m   %-3s %-40s %s\n' "$method" "$path" "$code"
    PASS=$((PASS+1))
  else
    printf '  \033[31mFAIL\033[0m %-3s %-40s got %s want %s\n' "$method" "$path" "$code" "$expect"
    head -c 160 "$TMP/body.json"; echo
    FAIL=$((FAIL+1)); FAILURES+=("$method $path -> $code")
  fi
}

hdr "auth"
TOK=$(aws cognito-idp admin-initiate-auth --region $REGION --user-pool-id $POOL \
      --client-id $CLIENT --auth-flow ADMIN_USER_PASSWORD_AUTH \
      --auth-parameters USERNAME="$SMOKE_USER",PASSWORD="$PW" \
      --query 'AuthenticationResult.AccessToken' --output text 2>/dev/null)
[ -n "$TOK" ] && echo "  ok   cognito token" && PASS=$((PASS+1)) || { echo "  FAIL cognito"; exit 1; }

curl -s -m 30 -X POST "$BASE/api/v1/auth/session" -H 'content-type: application/json' \
  -d "{\"providerAccessToken\":\"$TOK\"}" -o "$TMP/sess.json" -w ''
AT=$(python -c "import json;print(json.load(open('"$TMP/sess.json"'))['accessToken'])" 2>/dev/null)
[ -n "$AT" ] && echo "  ok   POST /auth/session" && PASS=$((PASS+1)) || { echo "  FAIL session"; exit 1; }

hdr "identity & roster"
check 200 GET  /api/v1/me
check 200 GET  /api/v1/roster/me
check 200 GET  /api/v1/admin/volunteers
check 200 GET  /api/v1/admin/volunteers/export.csv

hdr "reference data"
check 200 GET  /api/v1/stations
check 200 GET  /api/v1/gifts
check 200 GET  /api/v1/attendance

hdr "dashboards"
check 200 GET  /api/v1/dashboard/live
check 200 GET  /api/v1/dashboard/data-health

hdr "capture summaries"
check 200 GET  "/api/v1/registrations/summary"
check 200 GET  "/api/v1/footfall/summary"
check 200 GET  "/api/v1/footfall/live"
check 200 GET  "/api/v1/cards/funnel"
check 200 GET  "/api/v1/gifts/summary"

hdr "safety"
check 200 GET  /api/v1/incidents
check 200 GET  /api/v1/lost-person/active
check 200 GET  /api/v1/lost-found

hdr "comms & shifts"
check 200 GET  /api/v1/announcements
check 200 GET  /api/v1/roster/swaps
check 200 GET  /api/v1/roster/swaps/pending
check 200 GET  /api/v1/notifications/config

hdr "media & fallback"
check 200,503 GET /api/v1/media/config
check 200 GET  /api/v1/fallback/windows

hdr "audit (new)"
check 200 GET  "/api/v1/audit?limit=5"
check 200 GET  /api/v1/audit/facets
check 200 GET  /api/v1/audit/sink
check 400 GET  "/api/v1/audit?cursor=a&sinceId=b"
check 400 GET  "/api/v1/audit?limit=99999"

hdr "reports"
check 200 GET  /api/v1/reports/summary

hdr "WRITE PATH — the one that was broken"
STAMP=$(date +%s)
EMAIL="smoke$STAMP@spoh2027.test"
check 201 POST /api/v1/roster/volunteers \
  "{\"displayName\":\"Smoke Test $STAMP\",\"email\":\"$EMAIL\",\"role\":\"VOLUNTEER\"}"
NEWID=$(python -c "
import json
try: print(json.load(open('"$TMP/body.json"'))['volunteer']['id'])
except Exception: print('')
" 2>/dev/null)
if [ -n "$NEWID" ]; then
  echo "  created volunteer id=$NEWID (remember to delete it and its Cognito user)"
  check 200 PATCH "/api/v1/admin/volunteers/$NEWID" '{"displayName":"Smoke Renamed"}'
  check 200 POST  "/api/v1/admin/volunteers/$NEWID/deactivate" '{"reason":"smoke test cleanup"}'
fi

hdr "authz negative checks"
NOAUTH=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$BASE/api/v1/me")
[ "$NOAUTH" = "401" ] && { echo "  ok   unauthenticated -> 401"; PASS=$((PASS+1)); } \
                       || { echo "  FAIL unauthenticated -> $NOAUTH"; FAIL=$((FAIL+1)); }
BADORIGIN=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/session" \
  -H 'content-type: application/json' -H 'Origin: https://evil.example' -d '{"email":"x@y.test"}')
[ "$BADORIGIN" = "403" ] && { echo "  ok   untrusted origin -> 403"; PASS=$((PASS+1)); } \
                          || { echo "  FAIL untrusted origin -> $BADORIGIN"; FAIL=$((FAIL+1)); }

hdr "RESULT"
echo "  passed: $PASS"
echo "  failed: $FAIL"
for f in "${FAILURES[@]:-}"; do [ -n "$f" ] && echo "    - $f"; done
exit $(( FAIL > 0 ? 1 : 0 ))
