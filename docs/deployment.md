# Deployment

Pushes to `main` trigger [`.github/workflows/megaweaving-cicd.yaml`](../.github/workflows/megaweaving-cicd.yaml):

1. Path filters detect whether `server/**` or `client/**` changed.
2. Changed apps are built and pushed to GHCR.
3. The production host pulls the new images and restarts the affected containers.
4. Container health is verified before the job succeeds.

Third-party actions are pinned to commit SHAs and every job declares explicit `GITHUB_TOKEN` permissions.

Production runs from [`docker-compose.yml`](../docker-compose.yml): three Redis instances, `backend-api`, `backend-worker`, and `frontend`. API and worker share one image and differ only by `APP_ROLE`.

```bash
make up      # start the production stack
make logs    # tail everything; also logs-api / logs-worker / logs-frontend
make down
```
