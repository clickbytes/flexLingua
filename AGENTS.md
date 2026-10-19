@C:\Users\ppotepa\.codex\RTK.md

## Global code intelligence

- When a repository contains `.codegraph`, use CodeGraph for symbol lookup and code relationships before broad text searches.
- Prefer `codegraph status`, `query`, `callers`, `callees`, `impact`, and `affected` when they answer the question.
- If no index exists, use scoped text search. Indexing is the user's decision; run `codegraph sync` only when an existing index is stale.

## GitHub repository identity guard

- Before creating commits or performing authenticated GitHub writes such as push, run `& "$env:USERPROFILE\.codex\scripts\repo-check.ps1"` from the repository.
- For SSH remotes, add `-CheckRemoteAuth` to identify the account represented by the active SSH key. For deliberate selection, use `ppotepa.ps1` or `clickbytes.ps1`.
- If the helper reports MISMATCH, stop before committing or writing to GitHub. Do not switch accounts or change Git identity or credentials automatically.
- If it reports REVIEW, explain which identity check is incomplete before committing. Do not treat a GitHub CLI login as proof of HTTPS Git auth unless the Git credential helper uses GitHub CLI.
- The helper is read-only. Configure expected commit names and emails in `repo-profiles.json`; never put tokens or passwords there.

# flexLingua agent instructions

## Epic gate: one ACTIVE epic across all agents (mandatory)

Before **any implementation**, inspect the repo's currently open GitHub issues titled `[EPIC]`, their recorded status, all open implementation PRs, and the latest `main` SHA. GitHub issues/PRs are authoritative: never infer that an epic is finished solely from merged child PRs.

- Each open epic must be classified in its GitHub issue as `ACTIVE`, `QUEUED`, or `BLOCKED`. A `COMPLETED` epic is closed only after its actual DoD/evidence is satisfied. For older epics without a status, treat status as **unknown** and require explicit triage before starting feature code. Do not close incomplete or NOT RUN acceptance work to make the gate green.
- **Default: at most one ACTIVE epic in this repository, across all agents and all workstreams.** The sole exception is CR-LITE #474 with CR-DEEP #475: after governance task #529 is merged and the owner explicitly activates #475, these two epics may both be ACTIVE. Each must have its own dedicated worktree, at most one active implementation issue, and at most one open implementation PR. No third epic may become ACTIVE. If the status is unclear, a different pair claims ACTIVE, or an unrelated implementation PR is open, **STOP** and reconcile on GitHub.
- An epic and its child issues may be **planned** in state `QUEUED` while another epic is ACTIVE, but no code, tests, data activation, or implementation PR may be started for that queued epic. A `BLOCKED` epic stays visible with a concrete reason and open acceptance gaps; it is not counted as completed.
- To switch epics outside the #474/#475 exception: complete and close the current ACTIVE epic with real evidence, or obtain an **explicit user-requested pause**, record the open gaps/SHAs and mark it BLOCKED on GitHub. Only then mark one queued epic ACTIVE, naming the agreed next issue, owner, dependencies, and fresh base SHA. Under the #474/#475 exception, #474 may remain ACTIVE while the owner explicitly activates #475 after #529 merges; record both statuses, assignments, dependencies, and fresh base SHAs. Never claim a missing physical environment was tested.
- A user-requested governance-only correction to these work rules is permitted as **one narrowly scoped issue/PR**, provided it does not implement any queued epic. Do not use this exception for language, tests, lexicon, or UI features.

## Single worktree, issue, PR and identity gate (mandatory)

- Default to **exactly one existing primary local Git worktree** for this repository. Run `git worktree list` and `git status --short` before local implementation. The only exception is the concurrent #474/#475 pair: each epic gets one separate dedicated worktree so their branches and files cannot overlap. Before creating or using either worktree, inspect the list and status; preserve all existing worktrees and user changes. A dirty #474 worktree does not authorize touching it and does not prevent creating the separate #475 worktree. Never remove or clean another worktree. No other epic may create an additional worktree.
- Use one issue branch per worktree. By default, only one implementation issue and one implementation PR may be open repository-wide. Under the #474/#475 exception, each dedicated worktree may have one active issue and one open PR at a time, allowing at most one PR per epic concurrently. Assign an owner and comment on the issue with epic, exact file scope, latest `main` SHA, dependencies, and independent expected behavior before editing; also record the active assignment on that epic. Start the next issue within an epic only after its current PR is reviewed, required checks pass and it is merged. Refresh `main`, re-check conflicts, and record every new base SHA.
- Before any local commit/push, run the existing `repo-check.ps1` identity guard below. A MISMATCH stops all authenticated writes. Never silently switch accounts or change identity. For GitHub **connector-only** operations without a local repository, verify the explicitly selected linked account, repository, permissions, target branch and latest ref **before remote writes**. Do not claim `repo-check.ps1`, `git worktree list`, local tests, or local checks ran through the connector; record them as NOT RUN. A connector-created remote branch does not create or validate a local worktree.
- Every implementation PR must reference exactly one task and its ACTIVE epic. Review changed files, semantic impact, conflict status, provenance and the existing `translation-matrix` required check before merge; maintain an independently authored and explicitly approved `tests/cases/**` oracle. The project owner may explicitly delegate linguistic review of named cases to an agent; record the delegation, exact IDs and expected meanings, review reasoning, and agent authorship in a GitHub issue comment before setting `review.status:"approved"`. Delegation does not cover deletion or weakening of protected cases, data rights, or candidate approvals governed by a wave issue unless the owner explicitly includes them. Do not bypass these gates by editing expected output to match regressions. Record actual commands, SHAs, PASS/FAIL/INFRA/NOT RUN and limitations.
- After each merge, update that epic's checklist and free its assignment before starting its next issue. Plan-only child issues may remain open; they are not evidence of implemented functionality.

## Product contract

flexLingua is a bounded, rule-based translation prototype. Runtime and data changes use JavaScript ESM and JSON. Languages are independent `LanguagePlugin` packages; language-neutral meaning belongs in `js/core/` and `data/core/`. Preserve explicit ambiguity, unsupported results, CORE roles, and data provenance. Never silently guess or claim unrestricted language or CEFR coverage.

Do not add TypeScript, compatibility adapters, old language paths, unit-test suites for `js/**`, TUI/morphology/CEFR/benchmark runners, or `HANDOFF.MD`.

## Canonical sentence test matrix

`tests/` is the single canonical test location, and `tests/cases/**` is the only place where approved sentence-translation expectations live.

- Sentence-translation changes (engine/MeaningGraph behavior, CORE data, language plugins, manifests) must be accompanied by the sentence test matrix: independently authored cases explicitly approved by the project owner or an agent with a recorded delegation, covering text, MeaningGraph, roles, features, diagnostics, and allowed information loss. Changing a direction usually needs a positive case in both directions plus a controlled refusal or ambiguity where relevant. Matching engine output alone never approves an expected result.
- The only automated paths are the local matrix runner (wired as `npm test` through `tests/run.mjs`) and the single `translation-matrix` GitHub Actions workflow that runs the same matrix on pull requests and pushes to `main`; the required status check name is `translation-matrix`.
- Before merging a translation PR, compare its published `matrix.json` with the last successful `main` artifact at the PR base. Report case-ID additions/removals, changed protected inputs/expected/observed outcomes, result classes, inventory deltas, and the two SHA references in the PR. A green aggregate does not replace this comparison. New `proposed` cases remain exploratory and do not count as approved coverage.
- Result honesty rules: translation success, controlled refusal, ambiguity, known gaps, infrastructure errors, and NOT RUN are reported separately; never turn an infrastructure error into an expected refusal to get green results, and never count known gaps as PASS.

## Work scope

- Work on one GitHub issue and one PR at a time by default. Only #474 and #475 may each have one active issue and one open PR concurrently, in their separate worktrees. Before implementation, comment on the issue with owner, file scope, base SHA, dependencies, and expected behavior; record active assignments in the parent epic when applicable.
- Within each epic, do not start another issue until its current PR is merged. Rebase the next task on the resulting `main` SHA and record that base in its issue.
- Read the task, direct dependencies, and only the files needed for the change. Search narrowly. Plan cross-file work before editing, then make each file's complete change once.
- Keep changes within the issue. Preserve user changes, language data, and licensing/provenance sources unless the issue explicitly names them.
- Keep README and roadmap focused on durable product behavior. Record task progress, exact command results, and SHAs in the issue or PR.

## Acceptance

The sentence CLI is the manual acceptance path for language behavior:

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
```

The terminal application is started with `npm run tui` (or `start.bat` on Windows) and has exactly three modes: Translate, Chat, and Forms. Use `/help` in the app for current controls. Manually verify terminal behavior in an interactive Windows or Linux terminal, including keyboard navigation, resize, Unicode, and restoring the terminal on exit. If an interactive TTY is unavailable, report those checks as NOT RUN. The CLI remains the acceptance path for language behavior. The redesign specification is tracked in [issue #324](https://github.com/clickbytes/flexLingua/issues/324).

For each changed direction, review actual words and CORE roles, referents, tense, aspect, polarity, number, ambiguity, information loss, diagnostics, and exit code. Include positive examples and a refusal where relevant. State expected meaning independently before running the CLI; do not treat a matching string as semantic proof.

The canonical sentence test matrix is the automated acceptance gate for engine, CORE, language-data, and plugin changes: run `npm test` locally (`node tests/run.mjs --all`), and GitHub Actions enforces the same matrix as the required `translation-matrix` status check. See `tests/README.md` for the case contract. For infrastructure or documentation work outside the matrix, run only the syntax, import, reference, or CLI checks needed by the issue; other automated suites are not acceptance gates. Report exact commands and mark unrun checks as NOT RUN.

Use the repository's RTK command prefix for shell commands. Do not make broad audits, run unrelated commands, or claim checks that were not performed. Keep public file and API names free of `v2` and `legacy` suffixes.
