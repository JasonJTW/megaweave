#!/usr/bin/env bash
# Deploy-time migrations (ADR 0009), run on the production host by the backend deploy in
# .github/workflows/megaweaving-cicd.yaml before `docker compose up`, only when the
# repository variable AUTO_MIGRATE is 'true'. Any failure exits non-zero, the deploy stops
# and the running containers keep the old version.
#
#   1. `dbmate status`; refuse when it reports no applied migration: `schema_migrations` is
#      missing or empty, so the baseline was not done and dbmate would run every file;
#   2. no pending migration: done, no backup;
#   3. back up (scripts/backup-db.sh), then `dbmate migrate --strict`, which applies the
#      pending files in version order, stops at the first error, and refuses a pending file
#      older than the newest applied one.
#
# Environment: BACKUP_* as scripts/backup-db.sh; DB_TOOLS as there and DBMATE (the command
# that runs scripts/dbmate.sh with its arguments) for tests only.

set -euo pipefail
cd "$(dirname "$0")/.."

DBMATE="${DBMATE:-docker compose --profile tools run --rm -T dbmate}"

# Output from the database (error text can quote a migration) is indented, so no line of it
# can start a workflow command.
indent() { sed 's/^/    /'; }

dbmate() {
  # shellcheck disable=SC2086 # DBMATE is a command line
  $DBMATE "$@"
}

if ! status="$(dbmate status 2> >(indent >&2))"; then
  echo "::error title=Migrations failed::dbmate status failed. Nothing was deployed."
  exit 1
fi
applied="$(printf '%s\n' "$status" | sed -n 's/^Applied: \([0-9][0-9]*\)$/\1/p')"
pending="$(printf '%s\n' "$status" | sed -n 's/^\[ \] //p')"
if [ -z "$applied" ]; then
  echo "::error title=Migrations failed::could not read dbmate status. Nothing was deployed."
  printf '%s\n' "$status" | indent
  exit 1
fi
if [ "$applied" = "0" ]; then
  echo "::error title=Migrations refused::schema_migrations is missing or empty: run the baseline first (docs/deployment.md), or unset AUTO_MIGRATE. Nothing was deployed."
  exit 1
fi

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

if ! dbmate migrate --strict 2>&1 | indent; then
  echo "::error title=Migration failed::the deploy stopped before docker compose up; see docs/deployment.md \"Migration failed\"."
  exit 1
fi
echo "Migrations applied."
