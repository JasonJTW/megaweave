#!/bin/bash
# One scheduled Agent run (docs/agents/contributing.md). launchd or cron calls this;
# the model is pinned here, never read from the agent's own config.
#
#   .agents/skills/contribute/scripts/run.sh claude|codex
#
# Exits 0 when the run is skipped (another run holds the lock, Docker never came up,
# the checkout holds someone's manual work), so the scheduler does not retry.
set -uo pipefail

harness="${1:-}"
case "$harness" in
  claude) model="claude-opus-5-5" ;;
  codex) model="gpt-6.1-sol" ;;
  *) echo "usage: run.sh claude|codex" >&2; exit 2 ;;
esac

repo="$(cd "$(dirname "$0")/../../../.." && pwd)"
if [ "$(uname)" = Darwin ]; then
  log_dir="$HOME/Library/Logs/megaweave-contribute"
else
  log_dir="${XDG_STATE_HOME:-$HOME/.local/state}/megaweave-contribute"
fi
mkdir -p "$log_dir"
log="$log_dir/$(date +%Y%m%d-%H%M%S)-$harness.log"
exec >>"$log" 2>&1
# Keep the newest 60 logs (20 days at 3 runs a day)
ls -1t "$log_dir"/*.log 2>/dev/null | tail -n +61 | while read -r old; do rm -f "$old"; done

note() { echo "[contribute $(date '+%F %T')] $*"; }
note "harness=$harness model=$model repo=$repo"
cd "$repo" || exit 1

# One run at a time per clone; a lock left by a crashed run is reclaimed.
lock="$(git rev-parse --git-common-dir)/contribute.lock"
if ! mkdir "$lock" 2>/dev/null; then
  if kill -0 "$(cat "$lock/pid" 2>/dev/null)" 2>/dev/null; then
    note "another run is in progress; skipping"
    exit 0
  fi
  rm -rf "$lock" && mkdir "$lock" || exit 1
fi
echo $$ >"$lock/pid"
trap 'rm -rf "$lock"' EXIT

# The pre-push hook runs E2E against Docker.
if ! docker info >/dev/null 2>&1; then
  [ "$(uname)" = Darwin ] && open -a Docker
  for _ in $(seq 1 24); do docker info >/dev/null 2>&1 && break; sleep 5; done
  docker info >/dev/null 2>&1 || { note "Docker is not running; skipping"; exit 0; }
fi

# A run cut off mid-way leaves uncommitted work on its agent/ branch: stash it under the
# branch name, and the resumed run pops it. Uncommitted work anywhere else is a human's.
branch="$(git branch --show-current)"
if [ -n "$(git status --porcelain)" ]; then
  case "$branch" in
    agent/*)
      git stash push --include-untracked -m "contribute-wip $branch" && note "stashed interrupted work on $branch"
      ;;
    *)
      note "uncommitted changes on $branch (not an agent branch); skipping. Keep manual work in another clone."
      exit 0
      ;;
  esac
fi
git fetch origin --prune --quiet || { note "git fetch failed; skipping"; exit 0; }

prompt="Scheduled contribute run. Read .agents/skills/contribute/SKILL.md and follow its run mode exactly. Model: $model"

case "$harness" in
  claude)
    # auto: a classifier approves actions instead of a person; prompts nobody can answer
    # are denied. The one allow rule lets the run enable auto-merge (AGENTS.md).
    claude -p "$prompt" \
      --model "$model" --effort high \
      --permission-mode auto --permission-prompts none \
      --allowedTools "Bash(gh pr merge --auto --merge *)"
    ;;
  codex)
    # approve-for-me: workspace-write sandbox, escalations go through automatic review.
    codex exec -m "$model" -c model_reasoning_effort=high --approve-for-me -C "$repo" "$prompt"
    ;;
esac
status=$?
note "agent exited with $status"
exit "$status"
