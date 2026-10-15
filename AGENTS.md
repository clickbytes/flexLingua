# flexLingua — Codex development rules

## Objective

Optimize for fast, precise edits with the smallest reasonable amount of tool use.
The default is **FAST EDIT**, not repository audit or release preparation.
Follow the user's explicit task and stop when it is complete. Do not claim that
unrun checks passed. These rules do not waive the project's PR/CI release gates.

## Scope and execution

- Make the smallest change that satisfies the request. Do not add unsolicited
  refactoring, cleanup, features, documentation, or dependency updates.
- If the user identifies a file or function, start there. Read only the relevant
  context and direct dependencies needed to edit safely. Search narrowly first.
- Do not enumerate the repository, read many docs, or inspect unrelated tests
  at the start of every task. Do not repeatedly reread unchanged files.
- Avoid reading entire large files such as `js/core/grammar.js` or
  `data/morphology/pl.json` when a targeted search or excerpt suffices.
- For straightforward edits, do not write a plan, TODO list, or lengthy analysis.
  Make the edit and finish. Plan only genuinely cross-cutting work.
- Respect existing user changes; never discard or overwrite unrelated edits.
- Do not create branches, commits, tags, PRs, or GitHub issue updates unless asked.

## Avoid unnecessary commands

- Do **not** run `git status`, `git diff`, `git log`, `git show`, or similar Git
  inspection commands as routine preflight/postflight work. Use Git only when
  needed for the requested task, conflict safety, or an explicit PR/release flow.
- Do **not** run tests, builds, formatters, linters, audits, `npm install`,
  `npm audit`, or the development server just to be thorough.
- Do not launch broad searches, full test suites, background services, or
  additional validation after a change unless the task requires it.
- Do not chain multiple verification commands that substantially duplicate
  coverage. Do not retry a passing check.

## Validation policy: select the smallest level

1. **FAST EDIT (default):** For text, markup, documentation, styling, or a small
   localized change that does not alter a behavioral contract, edit and stop;
   no automatic tests or Git review.
2. **TARGETED CHECK:** For a behavior fix or change with relevant regression
   risk, choose only the most relevant existing test file(s). Run at most one
   focused test command by default, unless a failure or genuine risk requires
   more. Do not run all of `npm test` for a localized change.
3. **DATA CHECK:** When editing lexical, morphology, gold, or provenance data,
   run only the applicable focused validator if verification is needed.
   Do not launch every language audit for an unrelated dataset.
4. **FULL GATE:** Run comprehensive checks only when explicitly asked to
   prepare/verify a PR, merge, release, or significant cross-cutting change.
   `npm run check:release` includes `npm test` and multiple data/gold audits:
   do not run those separately again. `npm run check:core-gates` invokes the
   full release checks and requires a clean, committed working tree; do not
   run it during ordinary uncommitted editing. For release work, follow
   `docs/development-workflow.md` and report CI status for the exact PR SHA.

If a focused check fails, investigate the in-scope failure, fix it if appropriate,
and rerun that check once. Do not launch unrelated checks in response. If an
out-of-scope failure remains, report it briefly without expanding the task.
If a requested check cannot run, state that; never imply PASS.

## Where to look and which focused checks to select

Use this as a navigation guide, not as a mandatory reading or testing checklist.
Only choose paths relevant to the requested change.

- Translation / semantics / parsing: `js/core/engine.js`, `interlingua.js`,
  `grammar.js`, `ontology.js`; possible tests: `tests/semantics.test.js`,
  `tests/clauses.test.js`, `tests/node.test.js`.
- Questions: `js/core/grammar.js`, relevant CORE modules; when warranted,
  `npm run check:questions`.
- Conversation / reference: `js/core/conversation.js`, `dialogue-engine.js`,
  `response-planner.js`; focused tests include `tests/conversation-e4.test.js`,
  `tests/dialogue-engine.test.js`, `tests/anaphora-e3.test.js`,
  `tests/response-planner.test.js`.
- Morphology: `js/core/morphology/`, `data/morphology/`; focused test
  `tests/morphology.test.js`; `npm run check:morphology` for relevant data edits.
- Lexicon / concepts: `js/core/lexicon.js`, `data/concepts.json`,
  `data/pl.json`, `data/en.json`, `data/tr.json`; focused test
  `tests/core-lexicon.test.js`; `npm run check:lexicon` when appropriate.
- Data provenance: `data/provenance.json`; run
  `npm run check:data-provenance` if a data package or inventory entry changes.
- Studio / browser UI: `js/ui/studio.js`, `js/ui/dialogue.js`, `js/main.js`,
  `index.html`; possible tests: `tests/studio-ui.test.js`,
  `tests/dialogue-ui.test.js`, `tests/ui.test.js`.
- CI / release gating: `.github/workflows/core-engine.yml`,
  `tools/check-core-gates.mjs`, `package.json`; focused tests:
  `tests/ci-workflow.test.js`, `tests/core-release-gates.test.js`.
- Existing npm scripts are defined in `package.json`. Do not invent scripts.
  Node test runner: `node --test tests/<relevant-file>.test.js`.

## Product invariants

- flexLingua is a bounded, rule-based translation prototype. Preserve
  language-neutral CORE/INTER semantics and explicit diagnostics for unknown,
  ambiguous, or unsupported input; never silently guess a translation.
- Avoid changing unrelated Polish, English, and Turkish behavior.
- Do not weaken tests, alter gold expected outputs merely to make them pass,
  or fabricate independent evidence. If the intended contract truly changes,
  update the minimum relevant test/fixture and document the rationale.
- Update documentation only for a genuine lasting API, behavior, grammar,
  schema, architecture, run-command, or provenance contract change.
  GitHub Issues/PRs/Actions hold task progress and test status; do not turn
  README or ROADMAP into a task log.

## Final response

Use 1-3 concise sentences: what changed and, only if relevant, the exact check
run (or that checks were not run). No unsolicited suggestions, lengthy recap,
repository audit, or generic follow-up work. Then stop.
