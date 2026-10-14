# flexLingua agent workflow

Follow higher-priority user and environment instructions. Use `rtk` for shell commands when available.

## Source of truth

- GitHub Issues hold task scope, acceptance criteria, dependencies, and status.
- Pull requests hold proposed code and review; Actions records checks for the exact commit.
- Source code, tests, and the relevant files in `docs/` define current behavior and durable decisions.
- Do not create Markdown status logs, handoffs, or task copies. Record progress and blockers in the issue or PR.

## Start each task

- Start from one GitHub issue. Read its parent, blockers, acceptance criteria, and linked contracts before editing.
- Check `git status` first. Preserve existing changes. Do not rename or reuse a dirty task branch for unrelated work; isolate concurrent work in another worktree.
- If `.codegraph/` exists, check `codegraph status`. Sync an existing stale index before relying on it. Use CodeGraph for code symbols and relationships before broad source searches. Do not initialize or rebuild an index unless the user asks. Without an index, use scoped text searches.
- Read the relevant ADR or product contract before changing semantics, schemas, APIs, or language behavior. Resolve conflicts with an accepted decision before expanding implementation.

## Implement a small, verifiable slice

- Turn acceptance criteria into concrete tests before writing generalized code. Begin with the smallest end-to-end case that exercises the changed behavior.
- For language behavior, cover positive and refusal cases, CORE preservation, and both translation directions when they are in scope. Keep gold expectations independent from the implementation.
- Keep changes within the issue. Explain necessary changes to additional files in the PR.
- Update a document only when the task changes durable product behavior, an API, a schema, architecture, data provenance, or an accepted decision. Update the canonical document in the same PR; link it from the issue instead of copying its contents.

## Commands and validation

- Follow the global RTK rule. Use `rtk read` for files and `rtk rg` for scoped searches. Use `rtk proxy` when a command is unsupported or its filtered output hides details.
- Batch independent read-only checks. Keep edits, dependent tests, commits, pushes, and CI checks sequential.
- Run a focused test and relevant data or morphology checks while developing. Run `npm run check:release` once before finishing; it includes `npm test`. Run required extra gold checks when they are outside that gate.
- For documentation- or template-only changes, review the diff and use a relevant format check; do not run the full release gate solely for text changes.
- Report only commands that actually ran and their actual results. Check hosted Actions for the PR's exact SHA before declaring the change verified.

Typical command sequence (skip conditional steps that do not apply):

```sh
rtk git status --short --branch
rtk gh issue view <issue> --repo clickbytes/flexLingua --json title,body,state
rtk codegraph status                         # if .codegraph/ exists
rtk codegraph sync                           # only if that existing index is stale
rtk codegraph explore "<symbols and task area>"
rtk rg -n "<specific pattern>" js tests data docs
rtk read <relevant-file>
rtk proxy node --test tests/<focused-test>.test.js
rtk npm run check:release
```

## Make work visible

- Use one branch per issue. Open a draft PR after the first coherent slice passes its focused checks; link the issue and state the result, remaining acceptance criteria, and tests.
- If blocked, record the evidence, blocker, and next step in the issue. Do not leave the only progress record in the local checkout.
- Merge only after required checks and review are complete, following the user's instructions for the task.

See [the development workflow](docs/development-workflow.md) for the human-readable project process.
