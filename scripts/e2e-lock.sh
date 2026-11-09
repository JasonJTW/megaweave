#!/usr/bin/env bash
# Runs a command (the Playwright suite) while holding the E2E lock, waiting for any
# other run to finish first. Every worktree shares one E2E stack (fixed ports, one
# database): a second run's seed wipes the first run's data mid-test, and two runs at
# once double the CPU load. The lock lives in the git common dir, which all worktrees
# of this clone share.
set -euo pipefail

common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "${TMPDIR:-/tmp}")
lock="$common_dir/megaweave-e2e.lock"

waited=""
until mkdir "$lock" 2>/dev/null; do
  holder=$(cat "$lock/pid" 2>/dev/null || true)
  # A run that was killed (kill -9, closed terminal) leaves its lock behind
  if [[ -n $holder ]] && ! kill -0 "$holder" 2>/dev/null; then
    [[ $(cat "$lock/pid" 2>/dev/null || true) == "$holder" ]] && rm -rf "$lock"
    continue
  fi
  if [[ -z $waited ]]; then
    echo "⏳ Waiting for the E2E run in $(cat "$lock/dir" 2>/dev/null || echo 'another worktree') (pid ${holder:-?}) to finish..."
    waited=1
  fi
  sleep 3
done
echo $$ > "$lock/pid"
pwd > "$lock/dir"
trap 'rm -rf "$lock"' EXIT

"$@"
