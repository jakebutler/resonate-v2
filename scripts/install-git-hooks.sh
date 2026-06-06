#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  printf 'Skipping git hook install outside a git worktree.\n'
  exit 0
fi

cd "$repo_root"
git config core.hooksPath .githooks

printf 'Git hooks installed at %s\n' ".githooks"
