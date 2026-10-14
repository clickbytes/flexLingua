# A1 structural coverage

`npm run coverage:a1` reports declared lexemes, CORE senses, morphology bindings, grammar frames, and the project-authored A1 pilot. `npm run check:coverage` verifies inventory references and coverage invariants.

Structural coverage describes what is declared in repository data. It does not measure language proficiency. `cefr.percentage` remains null without a representative, legally sourced denominator and independently assessed sentence-level tests for both Polish-to-English and English-to-Polish.

## Evidence

- The target inventory is `data/coverage/a1-targets.json`; its scope and statuses are described in [A1 project scope](a1-scope.md).
- The original sentence corpus is described in [G2](g2-a1-gold.md).
- The combined report and its limits are documented in [G3](g3-a1-report.md).
- The pilot data in `data/coverage/a1-pilot.json` is authored for this project and is not copied from Oxford.

Run `npm run report:a1` to inspect the current inventory and test evidence. Run `npm run check:a1-gold` to enforce the declared regression checks. Report the tested constructions, directions, and refusals; do not present these checks as CEFR certification.

