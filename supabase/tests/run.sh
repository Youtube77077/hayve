#!/usr/bin/env bash
# Applies the Hayve migrations to a throwaway PostgreSQL cluster and runs the
# database-level privacy tests. Requires PostgreSQL 15+ binaries on PATH.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PORT:-55432}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUNAS="sudo -u postgres"; fi
$RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
trap '$RUNAS "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null; rm -rf "$DATA"' EXIT
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database hayve" >/dev/null
$PSQL -d hayve -f "$HERE/00_supabase_stub.sql"
for f in "$HERE"/../migrations/*.sql; do echo "applying $(basename "$f")"; $PSQL -d hayve -f "$f"; done
$PSQL -d hayve -f "$HERE/90_grants.sql"
$PSQL -d hayve -f "$HERE/99_gifting_privacy_test.sql"
$PSQL -d hayve -f "$HERE/98_redesign_test.sql"
