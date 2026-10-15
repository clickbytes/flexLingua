# flexLingua 1.0 MVP — release and verification

**Historical release instructions:** v1.0 supported a generated `file://` page. That format and its checks were retired in October 2026. The current UI runs through local HTTP; use `npm test` and `npm run check:release` for current validation.

This release completes the *proposed prototype roadmap* v0.7–v1.0, not the research goal of unrestricted natural-language translation.

| Milestone | Delivered | Explicit boundary |
|---|---|---|
| v0.7 | Finite propositional complements; nested belief and wider negation operand; semantic distinction between local/wide negation involving universal NP | No unrestricted scope calculus or arbitrary embeddings |
| v0.8 | Third JSON-driven Turkish adapter; SOV, nominative/accusative/dative, case-dependent definiteness and finite negative/positive verbs | Lexicon is small; no Turkish subordinate clauses or complete morphology |
| v0.9 | More case-aware analysis, finite matrix predicate agreement, bounded semantic recursion, structured error API, cross-language and adversarial tests | Not open-domain NLP; no neural disambiguation |
| v1.0 | Versioned API, three-language UI, docs and regression suite | Generated file:// standalone HTML was retired in October 2026; use the local HTTP UI |

## Release checklist

```sh
npm run check:core-gates
npm run dev
# open http://127.0.0.1:8000/
```

`check:core-gates` runs `check:release` once and emits deterministic JSON evidence: checked-out/source SHA, package version, a SHA-256 manifest of tracked files, Node/npm versions, test totals and gate outcomes. It refuses dirty tracked files or untracked files (except the local `.codegraph/` index). The CI `release-gate` job records the same fields from the two required jobs and aggregates their results without running the suites again. Reports omit timestamps, durations and process IDs.

The package has no install-time or runtime dependencies. The UI runs through the local HTTP server; no standalone HTML is maintained or generated. The gate command does not publish or change `package.json`.

## Version, limitations and rollback

Update `package.json` only after the planned change has passed its local and PR gates. Re-run `npm run check:core-gates` on the version-bearing commit and require the merge SHA's Actions before creating a release tag. Release notes must state the bounded supported behavior and known gaps; this prototype does not claim unrestricted translation or CEFR certification.

To roll back a released change, open a new PR containing `git revert <merge-sha>`, run the required checks, and merge only after they pass. Record the revert SHA and the reason in the incident and original issue; do not rewrite `main` history.

## Scientific / linguistic caution

A passing test verifies only the controlled inputs. There is no claim that the machine translates arbitrary text; syntax, morphology, pragmatics, coreference and quantifier scope are far more complex. The Turkish adapter is intentionally a stress test of sentence order and case marking. Syntax/semantic ambiguities are bounded; only some are represented as alternatives. This is not a reliable machine translator for legal, medical or safety-critical material.
