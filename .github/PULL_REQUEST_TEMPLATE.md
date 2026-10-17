## Issue

Closes #

## Summary

Describe the change and its result.

## Acceptance and scope

- [ ] Issue acceptance criteria are covered by this PR.
- [ ] Changed files stay within the issue scope; deviations are explained below.
- [ ] `npm test` (canonical sentence matrix) passes, and a sentence-behavior change (engine, CORE data, language plugins, or manifests) also ships independently authored approved cases in `tests/cases/**`.

## Sentence matrix results

- Exact command, SHA, and gate line from `npm test`:
- Translation pass / refusal / ambiguity counts; known gaps and NOT RUN entries exactly as reported:
- If behavior changed: new or updated case ids and the independently stated expectations (authored before running):

## Manual CLI or TUI review

Only needed for behavior beyond the approved matrix cases, issue reproduction, or TUI changes.

- Commands and directions:
- Expected meaning and actual text or refusal:
- CORE roles, diagnostics, exit codes, and commit SHA:

## Other checks

- Exact syntax, import, reference, or CLI checks (or NOT RUN with reason):

## Limitations or exceptions

List any requested checks that were not run or did not pass, with reason and next step. Never report an unrun or failed check as passing. Other automated suites are not acceptance gates; the canonical sentence matrix (`npm test` and the required `translation-matrix` GitHub Actions check) is enforced, and fixing it by editing approved expectations instead of the product is forbidden.
