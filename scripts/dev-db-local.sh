#!/usr/bin/env bash
#
# Local dev database without Docker.
#
# `npm run db:up` needs a Docker daemon, and cloud containers (and some laptops)
# have none. This runs the same database on the same port from the system's
# Postgres binaries, so server/.env.example and the test suites work unchanged.
#
#   scripts/dev-db-local.sh start     init on first run, start, create role + db
#   scripts/dev-db-local.sh stop
#   scripts/dev-db-local.sh status
#
# Overrides: PG_BIN (dir with initdb/pg_ctl), SPOH_PG_DIR (cluster home),
# SPOH_PG_PORT (default 5435). Idempotent: `start` on a running cluster only
# re-checks the role and database.
#
set -euo pipefail

PORT="${SPOH_PG_PORT:-5435}"
HOME_DIR="${SPOH_PG_DIR:-/var/lib/postgresql/spoh-baseline}"
DATA="$HOME_DIR/data"
LOG="$HOME_DIR/pg.log"

find_pg_bin() {
  if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN"; return; fi
  # Highest installed major; the project targets 17 and passes on 16.
  local dir
  dir=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
  [ -n "$dir" ] || dir=$(dirname "$(command -v pg_ctl 2>/dev/null || echo /nonexistent/x)")
  [ -x "$dir/pg_ctl" ] || { echo "no Postgres binaries found; set PG_BIN" >&2; exit 1; }
  echo "$dir"
}

PG=$(find_pg_bin)

# initdb and pg_ctl refuse to run as root, so as root we drop to `postgres`.
as_pg() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi
}

init_cluster() {
  [ -d "$DATA" ] && return
  mkdir -p "$HOME_DIR"
  [ "$(id -u)" -eq 0 ] && chown postgres:postgres "$HOME_DIR"
  as_pg "'$PG/initdb' -D '$DATA' -U postgres -A trust" >/dev/null
  echo "initialised cluster in $DATA"
}

is_running() {
  as_pg "'$PG/pg_ctl' -D '$DATA' status" >/dev/null 2>&1
}

start_cluster() {
  if is_running; then echo "already running on :$PORT"; return; fi
  as_pg "'$PG/pg_ctl' -D '$DATA' -w -o \"-p $PORT -k /tmp -c listen_addresses=localhost\" -l '$LOG' start" >/dev/null
  echo "started Postgres $("$PG/postgres" --version | awk '{print $3}') on :$PORT (log: $LOG)"
}

psql_admin() {
  "$PG/psql" -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -qtAc "$1"
}

ensure_role_and_db() {
  if [ "$(psql_admin "SELECT 1 FROM pg_roles WHERE rolname='spoh'")" != 1 ]; then
    # SUPERUSER because the integration suite creates and drops spoh2027_test itself.
    psql_admin "CREATE ROLE spoh LOGIN SUPERUSER PASSWORD 'spoh'"
    echo "created role spoh"
  fi
  if [ "$(psql_admin "SELECT 1 FROM pg_database WHERE datname='spoh2027'")" != 1 ]; then
    psql_admin "CREATE DATABASE spoh2027 OWNER spoh"
    echo "created database spoh2027"
  fi
}

case "${1:-start}" in
  start)
    init_cluster
    start_cluster
    ensure_role_and_db
    echo "DATABASE_URL=postgresql://spoh:spoh@localhost:$PORT/spoh2027"
    ;;
  stop)
    if is_running; then as_pg "'$PG/pg_ctl' -D '$DATA' -w stop" >/dev/null; echo stopped; else echo "not running"; fi
    ;;
  status)
    if is_running; then echo "running on :$PORT ($DATA)"; else echo "not running ($DATA)"; exit 3; fi
    ;;
  *)
    echo "usage: $0 start|stop|status" >&2
    exit 2
    ;;
esac
