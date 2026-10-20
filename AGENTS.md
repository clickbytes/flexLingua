@C:\Users\ppotepa\.codex\RTK.md

# flexLingua agent instructions

## Epic gate: one ACTIVE epic across all agents (mandatory)

Before **any implementation**, inspect the repo's currently open GitHub issues titled `[EPIC]`, their recorded status, all open implementation PRs, and the latest `main` SHA. GitHub issues/PRs are authoritative: never infer that an epic is finished solely from merged child PRs.

- Each open epic must be classified in its GitHub issue as `ACTIVE`, `QUEUED`, or `BLOCKED`. A `COMPLETED` epic is closed only after its actual DoD/evidence is satisfied. For older epics without a status, treat status as **unknown** and require explicit triage before starting feature code. Do not close incomplete or NOT RUN acceptance work to make the gate green.
- **At most one ACTIVE epic in this repository, across all agents and workstreams.** There are no parallel-epic exceptions. If multiple epics claim ACTIVE, or an unrelated implementation PR is open, **STOP** and reconcile the statuses on GitHub before implementation. Keep other open epics QUEUED or BLOCKED with their acceptance gaps visible; never infer completion from merged child PRs.
- An epic and its child issues may be **planned** in state `QUEUED` while another epic is ACTIVE, but no code, tests, data activation, or implementation PR may be started for that queued epic. A `BLOCKED` epic stays visible with a concrete reason and open acceptance gaps; it is not counted as completed.
- To switch epics: complete and close the current ACTIVE epic with real evidence, or obtain an **explicit user-requested pause**, record the open gaps/SHAs and mark it BLOCKED on GitHub. Only then mark one queued epic ACTIVE, naming the agreed next issue, owner, dependencies, and fresh base SHA. Never claim a missing physical environment was tested.
- A user-requested governance-only correction to these work rules is permitted as **one narrowly scoped issue/PR**, provided it does not implement any queued epic. Do not use this exception for language, tests, lexicon, or UI features.

## Single worktree, issue, PR and identity gate (mandatory)

- Use **exactly one existing primary local Git worktree** at `D:\Git\flexLingua` (native Windows). Run `git worktree list` and `git status --short` before local implementation. Never create a second worktree or a parallel clone. Preserve user changes; if the primary worktree is dirty, do not clean or overwrite it. Use an issue branch within this worktree while implementing. Keep the worktree on `main` when idle, and return it to refreshed `main` after each PR merge before starting the next issue.
- Work on **one active issue and one open implementation PR repository-wide**. Assign an owner and comment on the issue with epic, exact file scope, latest `main` SHA, dependencies, and independent expected behavior before editing; also record the active assignment on that epic. Start the next issue only after the current PR is reviewed, required checks pass and it is merged. Refresh `main`, re-check conflicts, and record every new base SHA.
- For GitHub **connector-only** operations without a local repository, verify the explicitly selected linked account, repository, permissions, target branch and latest ref **before remote writes**. Do not claim `repo-check.ps1`, `git worktree list`, local tests, or local checks ran through the connector; record them as NOT RUN. A connector-created remote branch does not create or validate a local worktree.
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

- Work on one GitHub issue and one PR at a time in the primary worktree. Before implementation, comment on the issue with owner, file scope, base SHA, dependencies, and expected behavior; record active assignments in the parent epic when applicable.
- Within each epic, do not start another issue until its current PR is merged. Rebase the next task on the resulting `main` SHA and record that base in its issue.
- Read the task, direct dependencies, and only the files needed for the change. Search narrowly. Plan cross-file work before editing, then make each file's complete change once.
- Keep changes within the issue. Preserve user changes, language data, and licensing/provenance sources unless the issue explicitly names them.
- Keep README and roadmap focused on durable product behavior. Record task progress, exact command results, and SHAs in the issue or PR.

### Implementation and validation sequence

- Before editing, identify required owner approvals, direct dependencies, expected behavior, file scope, and acceptance checks. Obtain any required approval for protected sentence expectations before changing those expectations or making completion depend on them.
- Finish the intended implementation and its supporting test or documentation changes before running the full applicable local suite. Do not use repeated full-suite runs as feedback after each small edit.
- After implementation is complete, review the diff and run the issue-specific checks and applicable local acceptance suite. Keep every required CI check and artifact comparison; this sequence does not reduce acceptance requirements.
- Rerun a failed check after fixing its cause. Rerun a previously passing check only when a later change can affect its result. Documentation-only changes do not require repeating the local sentence matrix when they cannot affect it; required PR checks still apply.
- Batch independent read-only inspections and checks. Avoid re-reading unchanged status and duplicating the same evidence across comments; keep the detailed validation record in the PR and link to it from the issue or epic.
- Record actual commands, base and result SHAs, PASS/FAIL/INFRA/NOT RUN, and limitations. Do not infer a check result from a related run or from elapsed time.

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
