#!/usr/bin/env bash
# Deploy-time migrations (ADR 0009), run on the production host by the backend deploy in
# .github/workflows/megaweaving-cicd.yaml before `docker compose up`, only when the
# repository variable AUTO_MIGRATE is 'true'. Any failure exits non-zero, the deploy stops
# and the running containers keep the old version.
#
#   1. refuse when `schema_migrations` is missing or empty (the baseline was not done);
#   2. no pending migration: done, no backup;
#   3. back up (scripts/backup-db.sh), then apply the pending files (scripts/db-migrate.sh up),
#      stopping at the first error.
#
# Environment: BACKUP_* as scripts/backup-db.sh; DB_TOOLS as there (tests only).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_TOOLS="${DB_TOOLS:-docker compose --profile tools run --rm -T db-tools}"

# Output from the database (error text can quote a migration) is indented, so no line of it
# can start a workflow command.
indent() { sed 's/^/    /'; }

runner() {
  # shellcheck disable=SC2086 # DB_TOOLS is a command line
  $DB_TOOLS sh /scripts/db-migrate.sh "$@"
}

set +e
pending="$(runner pending 2> >(indent >&2))"
status=$?
set -e
case "$status" in
  0) ;;
  2)
    echo "::error title=Migrations refused::schema_migrations is missing or empty: run the baseline first (docs/deployment.md), or unset AUTO_MIGRATE. Nothing was deployed."
    exit 1
    ;;
  *)
    echo "::error title=Migrations failed::could not read schema_migrations (exit $status). Nothing was deployed."
    exit 1
    ;;
esac

if [ -z "$pending" ]; then
  echo "No pending migrations; nothing to back up or apply."
  exit 0
fi
echo "Pending migrations:"
printf '%s\n' "$pending" | indent

if ! bash scripts/backup-db.sh 2>&1 | indent; then
  echo "::error title=Backup failed::no migration ran and nothing was deployed."
  exit 1
fi

if ! runner up 2>&1 | indent; then
  echo "::error title=Migration failed::the deploy stopped before docker compose up; see docs/deployment.md \"Migration failed\"."
  exit 1
fi
echo "Migrations applied."
