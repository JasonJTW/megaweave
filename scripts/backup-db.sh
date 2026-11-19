#!/usr/bin/env bash
# Pre-migration backup of the production database (ADR 0009), run by the backend deploy in
# .github/workflows/megaweaving-cicd.yaml before scripts/db-migrate.sh applies migrations.
#
# Contract (what the deploy relies on): exit 0 only after a complete, restorable backup of
# the production database taken now exists; any other outcome exits non-zero and the deploy
# stops. When the database moves to RDS, replace this script with one that creates a
# snapshot (aws rds create-db-snapshot + aws rds wait db-snapshot-available) and keep the
# contract; nothing else in the deploy changes.
#
# Now: mysqldump --single-transaction (consistent InnoDB snapshot, no table locks) of
# DB_DATABASE, with routines and triggers, gzipped into BACKUP_DIR on the host. The dump runs
# in the `db-tools` service of docker-compose.yml (mysql:8.0 client, server/.env.production,
# the backend's network), so it reaches the database exactly as the backend does and the
# password never leaves that container's environment.
#
# Environment (all optional):
#   BACKUP_DIR          default ~/megaweave-backups; must be outside the repo checkout
#   BACKUP_KEEP         newest backups kept in BACKUP_DIR, default 5
#   BACKUP_MIN_FREE_MB  refuse unless this much is free, default 2048 (and at least twice
#                       the newest backup)
#   BACKUP_S3_URI       e.g. s3://bucket/megaweave-db; also upload with SSE (AES256). Needs the
#                       aws CLI and credentials on the host; when set and the upload fails,
#                       the backup fails.
#   DB_TOOLS            the command that runs `sh -c ...` in a mysql:8.0 container with the
#                       DB_* env set; default: docker compose --profile tools run --rm -T db-tools
#                       (tests point it at a local container)
#
# Restore: docs/deployment.md "Restoring a backup".

set -euo pipefail
set -f

BACKUP_DIR="${BACKUP_DIR:-$HOME/megaweave-backups}"
BACKUP_KEEP="${BACKUP_KEEP:-5}"
BACKUP_MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-2048}"
DB_TOOLS="${DB_TOOLS:-docker compose --profile tools run --rm -T db-tools}"
REPO="$(cd "$(dirname "$0")/.." && pwd -P)"

die() {
  echo "ERROR: $1" >&2
  exit 1
}

[[ "$BACKUP_KEEP" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP must be a positive integer"
[[ "$BACKUP_MIN_FREE_MB" =~ ^[0-9]+$ ]] || die "BACKUP_MIN_FREE_MB must be a number"
if [ -n "${BACKUP_S3_URI:-}" ]; then
  [[ "$BACKUP_S3_URI" =~ ^s3://[a-z0-9][a-z0-9.-]*(/[A-Za-z0-9._/-]*)?$ ]] || die "BACKUP_S3_URI must look like s3://bucket/prefix"
  command -v aws >/dev/null || die "BACKUP_S3_URI is set but the aws CLI is not installed on this host"
fi

umask 077
created=""
[ -d "$BACKUP_DIR" ] || created=1
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd -P)"
case "$BACKUP_DIR/" in
  "$REPO"/*)
    [ -z "$created" ] || rmdir "$BACKUP_DIR"
    die "BACKUP_DIR ($BACKUP_DIR) is inside the repo checkout; the next checkout would delete it"
    ;;
esac

# Backup files in BACKUP_DIR, oldest first (names sort by time)
backups() {
  # shellcheck disable=SC2010 # the pattern admits only our own fixed-format names
  ls -1 "$BACKUP_DIR" | grep -E '^megaweave-[0-9]{8}T[0-9]{6}Z\.sql\.gz$' | LC_ALL=C sort || true
}

# Free space: the larger of BACKUP_MIN_FREE_MB and twice the newest backup
newest="$(backups | tail -n 1)"
need_kb=$((BACKUP_MIN_FREE_MB * 1024))
if [ -n "$newest" ]; then
  last_kb=$(( $(wc -c <"$BACKUP_DIR/$newest") * 2 / 1024 ))
  [ "$last_kb" -gt "$need_kb" ] && need_kb=$last_kb
fi
free_kb="$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 { print $4 }')"
[ "$free_kb" -ge "$need_kb" ] ||
  die "only $((free_kb / 1024)) MB free in $BACKUP_DIR, need $((need_kb / 1024)) MB; free space or lower BACKUP_KEEP"

name="megaweave-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
partial="$BACKUP_DIR/.$name.partial"
trap 'rm -f "$partial"' EXIT

# Single quotes: the variables expand inside the container, from server/.env.production
# shellcheck disable=SC2016
dump='export MYSQL_PWD="${MIGRATION_DB_PASSWORD:-$DB_PASSWORD}"; exec mysqldump --protocol=TCP -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "${MIGRATION_DB_USER:-$DB_USER}" --single-transaction --routines --triggers --set-gtid-purged=OFF --no-tablespaces --column-statistics=0 --hex-blob --default-character-set=utf8mb4 "$DB_DATABASE"'

echo "Backing up the database to $BACKUP_DIR/$name"
# shellcheck disable=SC2086 # DB_TOOLS is a command line
$DB_TOOLS sh -c "$dump" | gzip -c >"$partial" || die "mysqldump failed; no backup written"

# mysqldump writes this trailer only when the dump finished
gzip -t "$partial" || die "the backup is not a valid gzip file"
gzip -dc "$partial" | tail -n 1 | grep -q '^-- Dump completed' || die "the dump is incomplete (no 'Dump completed' trailer)"
mv "$partial" "$BACKUP_DIR/$name"
trap - EXIT
echo "Backup written: $BACKUP_DIR/$name ($(( $(wc -c <"$BACKUP_DIR/$name") / 1024 )) KB)"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  echo "Uploading to ${BACKUP_S3_URI%/}/$name"
  aws s3 cp --sse AES256 --only-show-errors "$BACKUP_DIR/$name" "${BACKUP_S3_URI%/}/$name" || die "S3 upload failed"
fi

# Keep the newest BACKUP_KEEP (names sort by time)
backups | LC_ALL=C sort -r | tail -n +$((BACKUP_KEEP + 1)) |
  while IFS= read -r old; do
    rm -f "$BACKUP_DIR/$old"
    echo "Removed old backup $old"
  done
