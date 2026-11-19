# Setup mode

One-time, with the contributor at the keyboard. They have done the three manual steps in `CONTRIBUTING.md` (agent CLI, `gh auth login`, clone) and opened you in the clone. Talk to them in Traditional Chinese; keep commands in English.

Work through the checks in order. For each: run the check, and when it fails, explain the fix, run it yourself when it needs no password or GUI, otherwise give them the exact command and wait. A check is done when its command shows the stated result. At the end, show the list with each check's result.

First learn two facts: the **harness** (`claude` for Claude Code, `codex` for Codex) and the **OS** (`uname`). macOS and Linux are supported; on Windows, set everything up inside WSL2 and use the Linux path.

## Checks

1. **Clone**: `git remote get-url origin` points at `JasonJTW/megaweave`; `git submodule update --init` succeeds.
2. **Dedicated clone**: tell them scheduled runs switch branches in this clone, so their own manual work belongs in another clone or a `git worktree`. `run.sh` skips a run when it finds uncommitted changes outside an `agent/` branch.
3. **Docker**: `docker info` succeeds. Missing: Docker Desktop from docker.com (macOS: also turn on "Start Docker Desktop when you sign in"). Give it at least 8 GB of memory (Settings → Resources).
4. **Node 22** (CI's version): `node --version` starts with `v22`. Fix with nvm (`nvm install 22 && nvm alias default 22`) or the nodejs.org installer.
5. **Dependencies and hooks**: `npm ci && npm ci --prefix client && npm ci --prefix server`; then `.git/hooks/pre-commit` and `.git/hooks/pre-push` exist (lefthook installs them).
6. **Browsers**: `cd client && npx playwright install chromium webkit` (Linux: add `--with-deps`).
7. **Local certificates**: `server/cert/localhost.{crt,key}` and `client/certificates/localhost{,-key}.pem` exist. Create them as CI does:

   ```bash
   mkdir -p server/cert client/certificates
   openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=localhost" \
     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
     -keyout server/cert/localhost.key -out server/cert/localhost.crt
   cp server/cert/localhost.key client/certificates/localhost-key.pem
   cp server/cert/localhost.crt client/certificates/localhost.pem
   ```

8. **E2E stack**: `make e2e-up` ends healthy, then `E2E_BUILD=1 make e2e` passes (the pre-push hook runs exactly this; expect 10+ minutes). A failure here would block every push, so fix it before scheduling.
9. **GitHub**: `gh auth status` is logged in; `gh api repos/JasonJTW/megaweave --jq .permissions.push` prints `true` (otherwise they ask the maintainer for a collaborator invite with Write and accept it); `gh auth setup-git` so `git push` uses the same login.
10. **Git identity**: `git config --global user.name` and `user.email` are set and belong to their GitHub account (`gh api user --jq '.login, .id'`). Suggest the noreply address `<id>+<login>@users.noreply.github.com`.
11. **Skills**: Codex reads this repo's `.agents/skills/`, so nothing to install. Claude Code: `claude plugin marketplace add mattpocock/skills && claude plugin install mattpocock-skills@mattpocock` (the interactive engineering skills; scheduled runs read the repo copies directly).
12. **Floor model** (`docs/agents/contributing.md`, Model floor):
    - Claude Code: `claude -p --model claude-opus-5-5 --effort high --permission-mode auto --output-format stream-json --verbose "Reply with OK"` succeeds, and its first `system`/`init` line shows `"model":"claude-opus-5-5"` and `"permissionMode":"auto"`. `~/.claude/settings.json` has no `fallbackModel`, and `ANTHROPIC_MODEL` is unset.
    - Codex: `~/.codex/config.toml` has `model = "gpt-6.1-sol"` and `model_reasoning_effort = "high"`; `codex exec -m gpt-6.1-sol -c model_reasoning_effort=high "Reply with OK"` succeeds. If they also seeded `CODEX_AUTH_JSON` for Codex Review, their local login must be a separate one (`docs/agents/review-workflows.md`).

    If the plan cannot run the floor model, stop setup here and tell them to contact the maintainer: no schedule on a smaller model.

## Schedule

`run.sh` pins the model, effort and permission mode on the command line, so the schedule is a system job rather than an app setting.

1. Preview: `node .agents/skills/contribute/scripts/install-schedule.mjs <harness>`. Default times (local): Claude Code 09:00, 14:00, 20:00; Codex 11:00, 16:00, 22:00. Other times go after the harness (`… claude 08:30 13:00 19:00`); keep them apart from the other contributor's.
2. Show them the rendered file and what it does: three runs a day, each picks at most one issue, logs to `~/Library/Logs/megaweave-contribute/` (Linux: `~/.local/state/megaweave-contribute/`). macOS starts a run missed during sleep once on wake; Linux cron skips it.
3. On their explicit yes, run it again with `--install`.
4. Offer a first run now: macOS `launchctl kickstart gui/$(id -u)/net.megaweaving.contribute`, Linux `.agents/skills/contribute/scripts/run.sh <harness>`; then read the newest log with them.

To pause: `install-schedule.mjs <harness> --uninstall`. Codex users can use a ChatGPT desktop app Scheduled task instead (UI only: the project folder, local checkout, model GPT-6.1 Sol, reasoning high, prompt from `run.sh`), but the app must stay open and nothing pins the model, so prefer the system job.
