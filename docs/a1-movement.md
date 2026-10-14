# A1 Batch 5 — intransitive movement: iść ↔ go

**Date:** 2026-10-14. Existing neutral `event.movement` has only the `agent` role; destination, travel mode and aspect distinctions are not represented.

Polish has a new `pl.isc.1` meaning mapping with a language-specific frame `[agent, @verb]`. Productive morphology uses `pl.verb.third_person` and three irregular overrides: `idzie/idą` and `szedł/szła/szło/szli/szły`. EN `en.go.1` and its existing productive paradigm are retained; missing legacy `go/goes/went` forms are filled to support the non-morphological adapter as well.

`tests/fixtures/gold-movement-a1.json` defines independent 9+9 sentences, 11 morphology forms and four negative controls. Both-direction semantic roles, tense, polarity, CORE serialisation and inverse morphological analysis are checked by `tests/movement-a1.test.js`. The new `check:gold-movement` gate belongs in CI and release.

**Semantic limit:** English `go` is broader than Polish `iść` (which can imply going on foot). This is a controlled approximation for general movement, not universal lexical equivalence. `go to school` and `iść do szkoły` must be refused rather than silently dropping destinations. Do not claim CEFR A1 has been completed.

Actions issue #9 still blocks full Node CI; offline bundle is owned by GUI agent (issue #16).

## Dowody izolowanej integracji

Prawdziwy Engine w izolowanym V8: 18/18 zdań i 4/4 odmowy; oddzielny produktowy moduł morfologii: 11/11 komórek z odwrotną analizą i walidacją zgodności historycznych form. **Nie** jest to pełne `npm test`; Actions są nadal zablokowane przed utworzeniem jobs.
