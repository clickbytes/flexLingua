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

## Product contract

flexLingua is a bounded, rule-based translation prototype. Runtime and data changes use JavaScript ESM and JSON. Languages are independent `LanguagePlugin` packages; language-neutral meaning belongs in `js/core/` and `data/core/`. Preserve explicit ambiguity, unsupported results, CORE roles, and data provenance. Never silently guess or claim unrestricted language or CEFR coverage.

Do not add TypeScript, compatibility adapters, old language paths, test runners, automated gold workflows, GitHub Actions, or `HANDOFF.MD`.

## Work scope

- Work on one GitHub issue and one PR at a time. Before implementation, comment on the issue with owner, file scope, base SHA, and dependencies; record active assignments in the parent epic when applicable.
- Do not start another issue until the current PR is merged. Rebase the next task on the resulting `main` SHA and record that base in its issue.
- Read the task, direct dependencies, and only the files needed for the change. Search narrowly. Plan cross-file work before editing, then make each file's complete change once.
- Keep changes within the issue. Preserve user changes, language data, and licensing/provenance sources unless the issue explicitly names them.
- Keep README and roadmap focused on durable product behavior. Record task progress, exact command results, and SHAs in the issue or PR.

## Acceptance

The sentence CLI is the only current acceptance path for language behavior:

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
```

For each changed direction, review actual words and CORE roles, referents, tense, aspect, polarity, number, ambiguity, information loss, diagnostics, and exit code. Include positive examples and a refusal where relevant. State expected meaning independently before running the CLI; do not treat a matching string as semantic proof.

For infrastructure or documentation work, run only the syntax, import, reference, or CLI checks needed by the issue. Automated test suites and Actions are not acceptance gates. Report exact commands and mark unrun checks as NOT RUN.

Use the repository's RTK command prefix for shell commands. Do not make broad audits, run unrelated commands, or claim checks that were not performed. Keep public file and API names free of `v2` and `legacy` suffixes.
