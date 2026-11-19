---
name: contribute
description: Set up this machine to run scheduled contributor agents on this repo (setup), or carry out one scheduled Agent run (run).
disable-model-invocation: true
---

# Contribute

A contributor lends their Claude Code or Codex subscription to resolve this repo's issues unattended. The rules are `docs/agents/contributing.md` (decisions: ADR 0007, 0008, 0009); this skill carries them out.

Pick the mode from the prompt:

- **run**: the prompt says it is a scheduled contribute run and names a `Model:`. Read [RUN.md](RUN.md) and follow it.
- **setup**: anything else, typically a person typing `/contribute` or `$contribute` in a fresh clone. Read [SETUP.md](SETUP.md) and follow it with them.

Files:

| Path | What it does |
| --- | --- |
| `scripts/agent.mjs` | `next` (resume, capacity, pick, claim with the race check), `show <n>` (an issue or PR with collaborator comments only), `release <n> <label>` (Decision points) |
| `scripts/run.sh` | What the scheduler calls: lock, Docker, stash an interrupted run, then the agent CLI with the floor model pinned |
| `scripts/install-schedule.mjs` | Renders and installs `schedule/launchd.plist.template` (macOS) or `schedule/crontab.template` (Linux) |
| `scripts/*.test.mjs` | `node --test .agents/skills/contribute/scripts/*.test.mjs` (CI runs them) |
