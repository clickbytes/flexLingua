# Manual CLI sentence spot checks

This guide is for human spot checks only. Automated sentence expectations live exclusively in the canonical test matrix (`tests/`), enforced by `npm test` and the required `translation-matrix` GitHub Actions check. Do not add expected-translation tables here.

## What to spot check

Use the CLI for behaviors that are not yet covered by approved matrix cases, for reproducing a reported issue, or for eyeballing known gaps before filing follow-ups:

```sh
node tools/translate.mjs --languages --json
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
node tools/translate.mjs --from pl --to en --text "Dziewczynka widzi psa." --json
node tools/translate.mjs --from tr --to en --text "Kız köpeği gördü." --json
node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json
node tools/translate.mjs --from en --to pl --text "I see you." --json
```

Review each result against an expectation you state **before** running: construction, roles with referents or concepts, number/definiteness, tense, aspect, polarity, quantity, alternates, information loss, diagnostics, and the exit code (0 success, 2 controlled unsupported/invalid/ambiguous refusal, 1 infrastructure error). A refusal (`text:null`, `meaning:null`) is a bounded result, not a translation. Text agreement alone is not semantic proof.

The six commands above illustrate one positive Polish direction, one positive English direction, one pilot (TR), one declared direction limit (AR), and one registered known gap (`I see you.` — infrastructure error, `GAP-EN-PL-DEIXIS-0001` in `tests/gaps/known-gaps.json`).

## Historical evidence run

The twenty-sentence manual evidence table that previously lived here (observed at `main@90ccb01fb203a0b3847f9f2fbcf95bddf7294f0a`, recorded in issue [#297](https://github.com/clickbytes/flexLingua/issues/297) before running) has been superseded: its approved expectations are now canonical cases under `tests/cases/`, its direction-limit refusals are protected pilot cases, and its uncovered behaviors are registered as known gaps in `tests/gaps/known-gaps.json` with `observedAtSha caffbd52b5951cccc06708d055574d68486d1a62`. Retrieve the original table from git history of this file if you need the pre-matrix record.

## Morphology provider checks

These are provider checks, not sentence translations, so they have no sentence MeaningGraph. Each command compiled the provider's finite paradigms in memory; no output table was written.

| Command | Observed provider coverage | Generated sample forms |
|---|---|---|
| `node tools/compile-language.mjs en` | 181/181 eligible lexemes, 100%, 431 forms, no missing lexemes; exit 0. | `en.girl.1`, plural → `girls`. |
| `node tools/compile-language.mjs pl` | 182/182 eligible lexemes, 100%, 2598 forms, no missing lexemes; exit 0. | `pl.pies.1`, singular accusative → `psa`. |
| `node tools/compile-language.mjs fi` | 1/6 eligible lexemes, 16.67%, 20 forms; missing `fi.girl.1`, `fi.book.1`, `fi.dog.1`, `fi.cat.1`, `fi.katsoa.1`; exit 0. | `fi.house.1`, singular partitive → `taloa`. |
| `node tools/compile-language.mjs ar` | 1/1 eligible lexemes, 100%, 2 forms, no missing lexemes; exit 0. | `ar.kataba.1`, third-person masculine singular past → `كَتَبَ`; present → `يَكْتُبُ`. |

The sample forms were also requested directly from each loaded provider's `morphology.generate({lexemeId, features})` method in a temporary ESM terminal script; that script was removed after the check. The Finnish 1/6 morphology coverage is the implementation background behind the en↔fi `event.visual_attention` known gaps.
