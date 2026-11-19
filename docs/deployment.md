# Deployment

Pushes to `main` trigger [`.github/workflows/megaweaving-cicd.yaml`](../.github/workflows/megaweaving-cicd.yaml):

1. Path filters detect whether `server/**` or `client/**` changed.
2. Changed apps are built and pushed to GHCR.
3. The production host pulls the new images and restarts the affected containers.
4. Container health is verified before the job succeeds.

The backend deploy also backs up the database and applies new migrations first when `AUTO_MIGRATE` is on; see [Database migrations](#database-migrations-adr-0009).

Third-party actions are pinned to commit SHAs and every job declares explicit `GITHUB_TOKEN` permissions.

Production runs from [`docker-compose.yml`](../docker-compose.yml): three Redis instances, `backend-api`, `backend-worker`, and `frontend`. API and worker share one image and differ only by `APP_ROLE`.

```bash
make up      # start the production stack
make logs    # tail everything; also logs-api / logs-worker / logs-frontend
make down
```

## Database migrations (ADR 0009)

The backend deploy can apply new files in `server/db/migrations/` before it starts the new containers. It is **off** until the repository variable `AUTO_MIGRATE` is `true`; until then every deploy prints a "Migrations skipped" notice and migrations are applied by hand, as before.

When it is on, the `Back up and migrate the database` step of the backend deploy runs [`scripts/deploy-migrate.sh`](../scripts/deploy-migrate.sh) on the production host, before `docker compose up`:

1. It refuses (the deploy fails, the running containers keep the old version) when `schema_migrations` is missing or empty, i.e. the baseline below was not done.
2. With no pending migration it does nothing else.
3. Otherwise it backs up the database ([`scripts/backup-db.sh`](../scripts/backup-db.sh)) and applies the pending files in filename order ([`scripts/db-migrate.sh`](../scripts/db-migrate.sh) `up`). A file that fails is not recorded, no later file runs, and the deploy stops before `docker compose up`.

`schema_migrations` records each applied file by name (`method` is `baseline` or `applied`); a recorded file never runs again. Every database command runs in the `db-tools` service of `docker-compose.yml` (the `mysql:8.0` client with `server/.env.production`, the backend's `extra_hosts` and network), so it reaches the database exactly as the backend does and the credentials stay inside that container. It uses `DB_USER` / `DB_PASSWORD` from `server/.env.production`; if that user lacks DDL rights, add `MIGRATION_DB_USER` and `MIGRATION_DB_PASSWORD` for a user that has them to `~/megaweave/server/.env.production` on the host (the backup uses them too).

Backups are `mysqldump --single-transaction --routines --triggers` (a consistent InnoDB snapshot without table locks), gzipped to `~/megaweave-backups/megaweave-<UTC time>.sql.gz` on the host, newest 5 kept. The script refuses to start with less than 2 GB free (or twice the last backup), and refuses a directory inside the repo checkout. `BACKUP_DIR`, `BACKUP_KEEP` and `BACKUP_MIN_FREE_MB` override the defaults. When the repository variable `BACKUP_S3_URI` (e.g. `s3://bucket/megaweave-db`) is set, each backup is also uploaded with `aws s3 cp --sse AES256`; that needs the aws CLI on the host and credentials allowed to `s3:PutObject` there (an instance role is best), and a failed upload fails the backup. After the move to RDS only `scripts/backup-db.sh` changes (to an RDS snapshot).

### Turning on automatic migrations

Run these once, from an up-to-date `main` checkout, in order. Steps 1 and 2 run on your machine (Docker and Node 22) through an SSH tunnel to the production host.

**0. Find the database.** On the host, `grep -E '^DB_(HOST|PORT|DATABASE)=' ~/megaweave/server/.env.production` shows where the backend connects (names below: `<db>` for `DB_DATABASE`, `<port>` for `DB_PORT`). When `DB_HOST` is `host.docker.internal`, the database listens on the host itself, so the tunnel target is `127.0.0.1:<port>`; otherwise use `DB_HOST:<port>`. `docker ps` shows the MySQL container (`<mysql-container>` below).

**1. Read-only schema check.** Create a user that can only read the schema, as root inside the MySQL container:

```sql
CREATE USER 'schema_check'@'%' IDENTIFIED BY '<random password>';
GRANT SELECT, SHOW VIEW, TRIGGER ON `<db>`.* TO 'schema_check'@'%';
GRANT SHOW_ROUTINE ON *.* TO 'schema_check'@'%';
```

`TRIGGER` is needed to read the trigger definitions (without it they are missing from the dump and the check fails); MySQL has no read-only trigger privilege, so drop the user when you are done. Then:

```bash
ssh -N -L 13306:127.0.0.1:<port> <user>@<production host>   # in another terminal
read -rs DB_PASSWORD && export DB_PASSWORD                  # schema_check's password, not echoed
DB_HOST=host.docker.internal DB_PORT=13306 DB_USER=schema_check DB_DATABASE=<db> \
  node scripts/check-prod-schema.mjs
```

It dumps the production schema with `mysqldump --no-data --single-transaction --skip-lock-tables` (reads only, one consistent snapshot, no locks), builds `server/db/schema.sql` in a throwaway local MySQL 8.0, normalises both (AUTO_INCREMENT counters, definers, index order) and diffs them. Exit 0 means they are equal. Anything else: read the diff (`-` production, `+` schema.sql), bring production or `schema.sql` (through a PR) in line, and run it again. Never baseline on a mismatch: the baseline would record migrations that production does not have.

**2. Baseline.** Use a user that can also create and fill `schema_migrations` (for example the `DB_USER` from `server/.env.production`, or the container's root):

```bash
read -rs DB_PASSWORD && export DB_PASSWORD
DB_HOST=host.docker.internal DB_PORT=13306 DB_USER=<user> DB_DATABASE=<db> \
  node scripts/baseline-db.mjs
```

It refuses when `schema_migrations` already has rows, and runs the step 1 check itself and refuses when it fails. Then it creates `schema_migrations` and records every file in `server/db/migrations/` as applied (`method = 'baseline'`) without running any, in one transaction, and lists them. `DROP USER 'schema_check'@'%';` afterwards.

Before step 3, check that the deploy's user can run DDL. On the host, in the runner's checkout of this repo (the deploy job's working directory, e.g. `~/actions-runner/_work/Megaweave/Megaweave`, which has `server/.env.production` after a deploy):

```bash
docker compose --profile tools run --rm -T db-tools sh -c \
  'MYSQL_PWD="${MIGRATION_DB_PASSWORD:-$DB_PASSWORD}" mysql --protocol=TCP -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "${MIGRATION_DB_USER:-$DB_USER}" -e "SHOW GRANTS"'
docker compose --profile tools run --rm -T db-tools sh /scripts/db-migrate.sh status
```

The grants need `ALTER, CREATE, INDEX, REFERENCES, TRIGGER` on `<db>` besides the usual `SELECT, INSERT, UPDATE, DELETE` (and `DROP` for an approved destructive migration). `status` lists the baseline rows and `Pending: none`.

**3. Turn it on.**

```bash
gh variable set AUTO_MIGRATE --body true
gh variable set BACKUP_S3_URI --body s3://<bucket>/<prefix>   # optional, see above
```

**4. Verify on the next backend deploy.** In the `Deploy Backend (Docker)` job, `Back up and migrate the database` runs instead of the "Migrations skipped" notice and prints `No pending migrations` (or the pending files, the backup path and `Applied <file>` for each). On the host, `ls -lh ~/megaweave-backups` shows the backup when a migration ran, and `db-migrate.sh status` (step 2) lists the new rows with `method = applied`.

To pause, `gh variable set AUTO_MIGRATE --body false`; deploys go back to skipping migrations.

### Migration failed

The deploy stopped before `docker compose up`, so the old containers still run, and the backup taken just before is in `~/megaweave-backups`. The step log shows the file and the MySQL error. The failed file is not in `schema_migrations`.

- A file of only DML (INSERT, UPDATE, DELETE) ran in one transaction and was rolled back: fix it in a new PR and redeploy.
- A file with DDL may have applied the statements before the failing one (MySQL commits DDL implicitly). Compare with `SHOW CREATE TABLE`, then either finish the remaining statements by hand and record the file, `INSERT INTO schema_migrations (filename, method) VALUES ('<file>', 'applied');`, or undo the applied statements and fix the file in a PR. Re-run the failed jobs of the workflow run to deploy.

### Restoring a backup

The last resort: it loses every write since the backup. A migration is additive (ADR 0009), so when only the new code is broken, deploy the previous image instead (below) and keep the data.

1. Stop writes: `docker compose stop backend-api backend-worker` (in the runner's checkout).
2. Back up the current state too, so the restore can be undone: `BACKUP_KEEP=10 bash scripts/backup-db.sh`.
3. Pause automatic migrations: `gh variable set AUTO_MIGRATE --body false`. The dump contains `schema_migrations` as it was, so the next deploy would apply the same migration again.
4. Restore, as root inside the MySQL container (`<backup>` is a file in `~/megaweave-backups`):

   ```bash
   docker exec -i <mysql-container> sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -e "DROP DATABASE \`<db>\`; CREATE DATABASE \`<db>\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"'
   gunzip -c ~/megaweave-backups/<backup> |
     docker exec -i <mysql-container> sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 <db>'
   ```

   To try a backup first without touching `<db>`, load it into a scratch database (`CREATE DATABASE megaweave_restore ...`, then the same `gunzip` into `megaweave_restore`) and drop that afterwards.
5. Start the previous backend image: `docker pull ghcr.io/jasonjtw/megaweaving-backend:<previous sha>`, `docker tag ghcr.io/jasonjtw/megaweaving-backend:<previous sha> ghcr.io/jasonjtw/megaweaving-backend:latest`, `docker compose up -d backend-api backend-worker`.
6. Revert the migration on `main` through a PR before turning `AUTO_MIGRATE` back on.
