#!/bin/sh
# Runs dbmate (ADR 0009) against the DB_* database, inside the dbmate image
# (DBMATE_IMAGE in scripts/check-db-migrations.mjs; the `dbmate` service in docker-compose.yml):
#
#   sh /scripts/dbmate.sh status            # applied [X] and pending [ ] files; never writes
#   sh /scripts/dbmate.sh migrate --strict  # apply pending files in version order
#
# Builds DATABASE_URL from the same variables as server/.env.production, percent-encoding the
# user and password, so the password never appears on a command line. Never dumps the schema
# (server/db/schema.sql is written by hand). Callers never run `dbmate up` (it creates the
# database) or `rollback` (migrations are fixed forward).
#
# Environment:
#   DB_HOST, DB_PORT (3306), DB_USER, DB_PASSWORD, DB_DATABASE   as server/.env.production
#   MIGRATION_DB_USER, MIGRATION_DB_PASSWORD   optional, override DB_USER/DB_PASSWORD when the
#                                              app user lacks DDL rights
#   MIGRATIONS_DIR   default: /migrations when it exists, else server/db/migrations
#
# The connection collation matches the mysql 8.0 client's default, so a trigger or view a
# migration creates is stored exactly as when schema.sql is loaded with `mysql`.

set -eu

: "${DB_HOST:?DB_HOST is not set}"
: "${DB_DATABASE:?DB_DATABASE is not set}"
user="${MIGRATION_DB_USER:-${DB_USER:?DB_USER is not set}}"
password="${MIGRATION_DB_PASSWORD:-${DB_PASSWORD:-}}"
port="${DB_PORT:-3306}"

# Host, port and database go into the URL unencoded, so they must not contain URL syntax
for value in "$DB_HOST" "$port" "$DB_DATABASE"; do
  case "$value" in
    *[!A-Za-z0-9._$-]*)
      echo "ERROR: DB_HOST, DB_PORT and DB_DATABASE may contain only letters, digits and . _ \$ -" >&2
      exit 1
      ;;
  esac
done

# Percent-encodes every byte, which is valid for any userinfo character
encode() {
  printf '%s' "$1" | od -An -v -tx1 | tr -d ' \n' | sed 's/../%&/g'
}

if [ -z "${MIGRATIONS_DIR:-}" ]; then
  if [ -d /migrations ]; then MIGRATIONS_DIR=/migrations; else MIGRATIONS_DIR=server/db/migrations; fi
fi

DATABASE_URL="mysql://$(encode "$user"):$(encode "$password")@$DB_HOST:$port/$DB_DATABASE?collation=utf8mb4_0900_ai_ci"
export DATABASE_URL
unset DB_PASSWORD MIGRATION_DB_PASSWORD password

exec dbmate --no-dump-schema --env-file /dev/null --migrations-dir "$MIGRATIONS_DIR" "$@"
