# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Other labels

| Label                | Applied to | Meaning                                                                                               |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `agent:claimed`      | Issue      | An agent holds the issue (`docs/agents/contributing.md`, ADR 0007)                                     |
| `needs-migration`    | PR         | The PR changes `server/db/schema.sql` and adds a migration; the `DB migrations` check requires it      |
| `migration-approved` | PR         | Maintainer only: lets the `DB migrations` check pass a destructive migration (ADR 0009)               |
| `adr-approved`       | PR         | Maintainer only: lets the `ADR decisions` check pass a changed, renamed or deleted ADR                |
