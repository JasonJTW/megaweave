#!/bin/sh
# Makes sure the Docker daemon is up before the compose targets (make dev-services,
# e2e-up, benchmark-up; the pre-push E2E runs e2e-up). On macOS it starts Docker Desktop and
# waits up to 3 minutes; elsewhere it fails with a message.
docker info >/dev/null 2>&1 && exit 0
if [ "$(uname)" = Darwin ] && open -a Docker 2>/dev/null; then
  echo "Docker is not running; starting Docker Desktop..."
  i=0
  while [ "$i" -lt 90 ]; do
    docker info >/dev/null 2>&1 && exit 0
    sleep 2
    i=$((i + 1))
  done
fi
echo "Docker is not running: start it, then retry." >&2
exit 1
