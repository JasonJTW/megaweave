#!/usr/bin/env bash
# Prepare a checkout to run: link the main checkout's local-only files into this worktree
# and install dependencies. The `.env*` files, the localhost certificates and `node_modules`
# are gitignored, so a new git worktree starts without them. Safe to re-run; in the main
# checkout it only installs dependencies that are missing.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
main=$(git worktree list --porcelain | awk 'NR==1 {print $2}')

# Link one path from the main checkout, unless this worktree already has its own copy.
link() {
  # Replace a dangling link left by a file that was missing when this worktree was set up.
  if [ -L "$1" ] && [ ! -e "$1" ]; then rm "$1"; fi
  if [ -e "$main/$1" ] && [ ! -e "$1" ]; then
    ln -s "$main/$1" "$1"
    echo "Linked $1 -> $main/$1"
  fi
}

if [ "$PWD" != "$main" ]; then
  # The main checkout's env files are the single copy every worktree links to.
  for dir in . client server; do
    for file in "$main/$dir"/.env*; do
      [ -f "$file" ] || continue
      rel="$dir/$(basename "$file")"
      link "${rel#./}"
    done
  done
  # Self-signed certificates for the HTTPS dev servers (see docs/development.md)
  link server/cert
  link client/certificates

  # Every worktree gets its own node_modules: a symlinked one resolves to the other checkout.
  npm ci
  npm ci --prefix client
  npm ci --prefix server
else
  for dir in . client server; do
    [ -d "$dir/node_modules" ] || npm ci --prefix "$dir"
  done
fi

missing=""
for file in server/.env.development client/.env.development; do
  [ -f "$main/$file" ] || missing="$missing $file"
done
if [ -n "$missing" ]; then
  echo "The main checkout ($main) has no:$missing"
  echo "Create them there (see docs/development.md), then re-run: npm run setup:worktree"
fi
