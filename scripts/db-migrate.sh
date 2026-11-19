#!/bin/sh
# Migration runner (ADR 0009). Applies server/db/migrations/*.sql in filename order and
# records each one in the `schema_migrations` table, so a recorded file never runs again.
#
#   sh scripts/db-migrate.sh status     # recorded and pending files; never writes
#   sh scripts/db-migrate.sh pending    # pending filenames, one per line; never writes
#   sh scripts/db-migrate.sh up         # apply pending files, stop at the first error
#   sh scripts/db-migrate.sh baseline   # record every file as applied without running it
#
# Needs only the `mysql` 8.0 client and POSIX sh, so it runs inside the mysql:8.0 image:
# on the production host the deploy runs it through the `db-tools` service in
# docker-compose.yml (same env file and network as the backend).
# `baseline` is called by scripts/baseline-db.mjs after the production schema check passes;
# do not run it by hand.
#
# Environment:
#   DB_HOST, DB_PORT (3306), DB_USER, DB_PASSWORD, DB_DATABASE   as server/.env.production
#   MIGRATION_DB_USER, MIGRATION_DB_PASSWORD   optional, override DB_USER/DB_PASSWORD when the
#                                              app user lacks DDL rights
#   MIGRATIONS_DIR   default: /migrations when it exists, else server/db/migrations
#
# Exit codes: 0 ok, 1 error (nothing after the failed file ran), 2 refused (baseline state).
#
# The `mysql` client runs each file in one session, exactly as scripts/check-db-migrations.mjs
# applies it in CI. A file is wrapped in START TRANSACTION ... INSERT INTO schema_migrations ...
# COMMIT: a file of only DML is all-or-nothing; DDL commits implicitly in MySQL, so a file
# with DDL that fails halfway leaves its earlier statements applied and unrecorded. The runner
# stops there; see docs/deployment.md "Migration failed".

set -eu
set -f # no globbing: filenames are split on newlines only

TABLE=schema_migrations
NAME_PATTERN='^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9][a-z0-9-]*\.sql$'
NL='
'
IFS="$NL"

if [ -z "${MIGRATIONS_DIR:-}" ]; then
  if [ -d /migrations ]; then MIGRATIONS_DIR=/migrations; else MIGRATIONS_DIR=server/db/migrations; fi
fi

: "${DB_HOST:?DB_HOST is not set}"
: "${DB_DATABASE:?DB_DATABASE is not set}"
DB_USER_EFFECTIVE="${MIGRATION_DB_USER:-${DB_USER:?DB_USER is not set}}"
# The password travels in MYSQL_PWD, never on a command line
MYSQL_PWD="${MIGRATION_DB_PASSWORD:-${DB_PASSWORD:-}}"
export MYSQL_PWD

db() {
  mysql --protocol=TCP -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER_EFFECTIVE" \
    --default-character-set=utf8mb4 --batch --skip-column-names "$DB_DATABASE" "$@"
}

die() {
  echo "ERROR: $1" >&2
  exit "${2:-1}"
}

# Every function below sets a global instead of printing, so a failure inside it exits the
# script instead of a command-substitution subshell.

# FILES: migration filenames in apply order (byte order, as the CI check sorts them)
load_files() {
  [ -d "$MIGRATIONS_DIR" ] || die "migrations directory $MIGRATIONS_DIR not found"
  listing="$(ls -1 "$MIGRATIONS_DIR")" || die "cannot list $MIGRATIONS_DIR"
  listing="$(printf '%s\n' "$listing" | LC_ALL=C sort)"
  FILES=""
  for name in $listing; do
    case "$name" in *.sql) ;; *) continue ;; esac
    printf '%s\n' "$name" | grep -Eq "$NAME_PATTERN" ||
      die "$name does not match YYYY-MM-DD-slug.sql; rename it before deploying"
    FILES="$FILES$name$NL"
  done
}

# TABLE_STATE: missing, empty or ready; RECORDED: recorded filenames
load_state() {
  count="$(db -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$TABLE'")" ||
    die "cannot query the database"
  RECORDED=""
  if [ "$count" != "1" ]; then
    TABLE_STATE=missing
    return 0
  fi
  RECORDED="$(db -e "SELECT filename FROM \`$TABLE\` ORDER BY filename")" || die "cannot read \`$TABLE\`"
  if [ -z "$RECORDED" ]; then TABLE_STATE=empty; else TABLE_STATE=ready; fi
}

# Refuses (exit 2) until the baseline has recorded the migrations production already has
require_baseline() {
  load_state
  case "$TABLE_STATE" in
    missing) die "\`$TABLE\` does not exist: run the baseline first (docs/deployment.md)" 2 ;;
    empty) die "\`$TABLE\` is empty: run the baseline first (docs/deployment.md)" 2 ;;
  esac
}

# PENDING: files not recorded yet, in apply order
load_pending() {
  load_files
  PENDING=""
  for name in $FILES; do
    printf '%s\n' "$RECORDED" | grep -qxF "$name" || PENDING="$PENDING$name$NL"
  done
}

# The recording INSERT is appended to the file, so the file's last statement must be closed
ends_with_semicolon() {
  grep -v '^[[:space:]]*--' "$1" | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$' | tail -n 1 |
    grep -q ';[[:space:]]*$'
}

create_table() {
  db -e "CREATE TABLE IF NOT EXISTS \`$TABLE\` (
    \`filename\` varchar(255) COLLATE utf8mb4_bin NOT NULL,
    \`method\` enum('applied','baseline') COLLATE utf8mb4_unicode_ci NOT NULL,
    \`applied_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`filename\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Applied server/db/migrations files (scripts/db-migrate.sh, ADR 0009)'" ||
    die "cannot create \`$TABLE\`"
}

cmd_status() {
  load_state
  if [ "$TABLE_STATE" != ready ]; then
    echo "\`$TABLE\` is $TABLE_STATE: baseline not done."
    exit 2
  fi
  echo "Recorded:"
  db -e "SELECT CONCAT('  ', filename, '  ', method, '  ', applied_at) FROM \`$TABLE\` ORDER BY filename" ||
    die "cannot read \`$TABLE\`"
  load_pending
  if [ -z "$PENDING" ]; then
    echo "Pending: none"
  else
    echo "Pending:"
    for name in $PENDING; do echo "  $name"; done
  fi
}

cmd_pending() {
  require_baseline
  load_pending
  printf '%s' "$PENDING"
}

cmd_up() {
  require_baseline
  load_pending
  if [ -z "$PENDING" ]; then
    echo "No pending migrations."
    return 0
  fi
  for name in $PENDING; do
    ends_with_semicolon "$MIGRATIONS_DIR/$name" ||
      die "$name: the last statement does not end with ';'; nothing applied"
  done
  for name in $PENDING; do
    echo "Applying $name"
    # Filenames match NAME_PATTERN (no quotes), so the literal below is safe
    if ! {
      printf 'START TRANSACTION;\n'
      cat "$MIGRATIONS_DIR/$name"
      printf "\nINSERT INTO \`%s\` (filename, method) VALUES ('%s', 'applied');\nCOMMIT;\n" "$TABLE" "$name"
    } | db; then
      die "$name failed; it is not recorded and no later migration ran. See docs/deployment.md \"Migration failed\"."
    fi
    echo "Applied $name"
  done
}

cmd_baseline() {
  load_state
  [ "$TABLE_STATE" != ready ] || die "\`$TABLE\` already has rows; the baseline runs once" 2
  load_files
  [ -n "$FILES" ] || die "no migrations in $MIGRATIONS_DIR"
  create_table
  {
    printf 'START TRANSACTION;\n'
    for name in $FILES; do
      printf "INSERT INTO \`%s\` (filename, method) VALUES ('%s', 'baseline');\n" "$TABLE" "$name"
    done
    printf 'COMMIT;\n'
  } | db || die "baseline failed; nothing recorded"
  echo "Recorded these migrations as applied (baseline), without running them:"
  for name in $FILES; do echo "  $name"; done
}

case "${1:-}" in
  status) cmd_status ;;
  pending) cmd_pending ;;
  up) cmd_up ;;
  baseline) cmd_baseline ;;
  *) die "usage: $0 status|pending|up|baseline" ;;
esac
