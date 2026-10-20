---
description: Work on GitHub issues in flexLingua with the gh CLI on Windows. Use for reading an assigned issue, recording scope and progress, editing issue status or checklists, or creating a narrowly scoped issue.
name: gh-issues-cli
---
# GitHub issues through `gh`

Follow the repository `AGENTS.md` gates for the active epic, issue assignment, worktree, and GitHub identity. Start from the issue number supplied by the user or current assignment. Read that issue and its direct dependencies; list other issues only when a repository gate requires it.

- Use `gh issue view`, `gh issue list`, `gh issue create`, `gh issue comment`, and `gh issue edit` for ordinary issue work. Prefer selected `--json` fields for focused reads.
- Before an authenticated write, run the repository identity guard required by `AGENTS.md`. Keep issue comments concise and put detailed validation evidence in the PR when one exists.
- Write multiline Markdown to a UTF-8 file and pass `--body-file` for creates, comments, and edits. Read the issue back after changing its body or status.
- On Windows PowerShell, preserve an existing issue body by saving `gh issue view NUMBER --json body` as JSON and parsing its `body` field. Capturing `--jq .body` into a PowerShell variable can collapse line breaks. Check that intended paragraphs and checklist lines survive the edit.
- Use `gh api` only for an operation that `gh issue` cannot perform. Keep the call limited to that operation.

Reference: [GitHub CLI issue manual](https://cli.github.com/manual/gh_issue).
