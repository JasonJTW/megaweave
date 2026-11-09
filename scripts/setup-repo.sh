#!/usr/bin/env bash
# Apply the GitHub settings this repo relies on: merge settings and the `main` ruleset
# (scripts/main-ruleset.json). These live on GitHub, not in git, so cloning or creating a repo
# from the template does not copy them. Needs `gh` logged in with admin rights. Safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Auto-merge waits on the ruleset's required checks; merged branches are deleted.
# Only merge commits are allowed, so a wrong `gh pr merge` flag fails instead of silently squashing.
gh api -X PATCH "repos/$repo" \
  -F allow_auto_merge=true -F delete_branch_on_merge=true \
  -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false --silent
echo "Enabled auto-merge and delete-branch-on-merge, merge commits only, on $repo"

file=scripts/main-ruleset.json
name=$(jq -r .name "$file")
id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")

if [ -n "$id" ]; then
  gh api -X PUT "repos/$repo/rulesets/$id" --input "$file" --silent
  echo "Updated ruleset '$name' (#$id) on $repo"
else
  gh api -X POST "repos/$repo/rulesets" --input "$file" --silent
  echo "Created ruleset '$name' on $repo"
fi

# The ruleset is the only source of branch rules. A classic branch protection on main would
# apply on top of it, invisible to scripts/main-ruleset.json. Remove it only once GitHub reports
# the ruleset's rules active on the branch, so main is never left unprotected.
branch=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
expected=$(jq -c '[.rules[].type] | sort' "$file")
active=$(gh api "repos/$repo/rules/branches/$branch" \
  --jq "[.[] | select(.ruleset_source == \"$repo\") | .type] | unique | sort" | jq -c .)
strict=$(gh api "repos/$repo/rules/branches/$branch" \
  --jq '[.[] | select(.type == "required_status_checks") | .parameters.strict_required_status_checks_policy] | any')
if [ "$active" != "$expected" ] || [ "$strict" != "true" ]; then
  echo "Ruleset '$name' is not fully active on $branch (active: $active, expected: $expected, strict: $strict)." >&2
  echo "Left the classic branch protection in place; fix the ruleset and re-run." >&2
  exit 1
fi
if gh api "repos/$repo/branches/$branch/protection" --silent 2>/dev/null; then
  gh api -X DELETE "repos/$repo/branches/$branch/protection" --silent
  echo "Removed the classic branch protection on $branch (the ruleset replaces it)"
fi

# The ruleset requires PRs to be up to date with main, and
# .github/workflows/update-auto-merge-branches.yml merges main into auto-merge PRs that fall
# behind. It pushes with the AUTO_UPDATE_TOKEN secret so the required checks run again.
if ! gh secret list --json name -q '.[].name' | grep -qx AUTO_UPDATE_TOKEN; then
  cat <<EOF

Missing secret AUTO_UPDATE_TOKEN: auto-merge PRs that fall behind main will wait for a manual
"Update branch". Create a fine-grained token at https://github.com/settings/personal-access-tokens/new
(repository access: only $repo; permissions: Contents, Pull requests and Workflows read and write;
Workflows lets it merge a main that changed .github/workflows),
then run: gh secret set AUTO_UPDATE_TOKEN --repo $repo
EOF
fi
