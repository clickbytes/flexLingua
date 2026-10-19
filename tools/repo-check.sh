#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'repo-check: %s\n' "$1" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this from inside the flexLingua repository"
origin_url="$(git -C "$repo_root" remote get-url origin 2>/dev/null)" || fail "origin remote is missing"

case "$origin_url" in
  https://github.com/clickbytes/flexLingua|https://github.com/clickbytes/flexLingua.git)
    ;;
  *)
    fail "origin must be the HTTPS remote https://github.com/clickbytes/flexLingua.git"
    ;;
esac

github_login="$(gh api user --jq '.login' 2>/dev/null)" || fail "GitHub CLI authentication is unavailable"
[[ "$github_login" == "clickbytes" ]] || fail "active GitHub account is not clickbytes"

credential_helpers="$(git -C "$repo_root" config --get-urlmatch credential.helper https://github.com 2>/dev/null || true)"
[[ "$credential_helpers" == *"gh auth git-credential"* ]] || fail "HTTPS credential.helper must use gh auth git-credential"

credential_output="$(
  printf 'protocol=https\nhost=github.com\n\n' |
    git -C "$repo_root" -c credential.helper= -c credential.helper='!gh auth git-credential' credential fill 2>/dev/null
)" || fail "GitHub CLI credential helper could not provide an HTTPS credential"

has_username=false
has_password=false
while IFS= read -r line; do
  case "$line" in
    username=*)
      [[ -n "${line#username=}" ]] && has_username=true
      ;;
    password=*)
      [[ -n "${line#password=}" ]] && has_password=true
      ;;
  esac
done <<< "$credential_output"
unset credential_output line
[[ "$has_username" == true && "$has_password" == true ]] || fail "GitHub CLI credential helper returned an incomplete credential"

worktree_config="$(git -C "$repo_root" config --bool --get extensions.worktreeConfig 2>/dev/null || true)"
[[ "$worktree_config" == true ]] || fail "worktree-specific Git config must be enabled"
author_name="$(git -C "$repo_root" config --worktree --get user.name 2>/dev/null)" || fail "worktree-specific user.name is missing"
author_email="$(git -C "$repo_root" config --worktree --get user.email 2>/dev/null)" || fail "worktree-specific user.email is missing"
[[ "$author_name" == "clickbytes" && "$author_email" == "potepapawel@hotmail.com" ]] || fail "worktree-specific commit author does not match clickbytes"

printf 'repo-check: PASS (clickbytes / flexLingua / worktree author verified; credentials withheld)\n'
