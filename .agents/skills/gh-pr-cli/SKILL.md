---
description: Handle the single active flexLingua pull request with the gh CLI on Windows. Use for PR creation, review evidence, required checks, artifact comparison, merge, and post-merge recording.
name: gh-pr-cli
---
# Pull requests through `gh`

Follow the repository `AGENTS.md` rules for one issue and PR, identity, acceptance evidence, and merge. Operate on the assigned issue and its PR. Do not start another implementation PR until the current one is merged.

- Use `gh pr view`, `gh pr list`, `gh pr diff`, `gh pr checks`, `gh pr create`, `gh pr comment`, and `gh pr merge` for ordinary PR work. Use `gh run list`, `gh run view`, and `gh run download` for workflow status and artifacts. Prefer selected `--json` fields and short output.
- Before authenticated writes and local commits or pushes, run the identity guard in `AGENTS.md`. Inspect changed files, conflict status, review state, and the required `translation-matrix` check before merge.
- Put multiline PR descriptions and comments in UTF-8 files and pass `--body-file`. Read back the posted text when its exact content matters.
- For translation PRs, compare the PR `matrix.json` artifact with the last successful `main` artifact at the PR base, as `AGENTS.md` requires. Report both SHAs, case ID changes, protected expectations and observed outcomes, result classes, and inventory deltas. A green aggregate check is not the comparison.
- Record commands actually run and PASS, FAIL, INFRA, or NOT RUN. After merge, refresh local `main`, verify the merge SHA and required check, and update the issue and epic assignment.
- Use `gh api` only when the relevant `gh pr` or `gh run` command cannot perform the operation.

References: [GitHub CLI PR manual](https://cli.github.com/manual/gh_pr), [workflow run manual](https://cli.github.com/manual/gh_run).
