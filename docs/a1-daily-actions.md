# A1 Batch 6 — pisać/write and otwierać/open

**Data:** 2026-10-14. Added two daily predicates as language-independent semantic events and distinct PL/EN lexical mappings, **without sentence-pair runtime lookup**.

- Existing `event.write` is now linked to `pisać/write`, with controlled agent + theme structures.
- New `event.open` has explicit `agent:person` and `theme:physical_object`, so opening another person is invalid. Polish `otwierać` governs accusative, which changes to genitive under local negation where the grammar licenses it.
- Polish present/past paradigms cover `pisze/piszą/pisał/pisała/pisali` and `otwiera/otwierają/otwierała/otwierali`; English `write/writes/wrote` has a past exception and `open/opens/opened` is regular.

`tests/fixtures/gold-daily-actions-a1.json` contains 20 independent PL/EN examples covering source and target roles, negative scope, tense, plural morphology and theme-gap questions, 15 manually chosen forms and 5 rejected constructions. `npm run check:gold-actions` is added to release and lexical CI gates.

## Scope and limitations

`event.write` is **historically defined with permissive `entity` roles**; this batch does not silently narrow its ontology and therefore does not claim to prohibit nonsensical combinations of arbitrary objects. `event.open` is typed more strictly. No general CEFR A1 compliance is claimed. The A1 project checklist grows from 22 to 23 targets to include `event.open`; it remains a planning subset, **not** a CEFR denominator.

At the time of this report GitHub Actions failed at startup (#9). Later hosted release runs succeeded. Standalone parity and its GUI issue have since been retired; the UI runs through local HTTP.

## Plain vs. productive morphology — explicit coverage boundary

The earlier curated lexeme `object.window` intentionally has **no hand-written surface forms** in the canonical lexicon; it is licensed by the independent morphology package. The plain language adapter must not fabricate an unconfigured word form, while a productive adapter may handle `okno/window`. Therefore the principal 20-case gold uses `book/książka` for `open`, which exists in the legacy surface inventory. Two **separately labelled `productiveOnly` fixtures** cover `window/okno` using the actual morphology. Tests assert that plain-mode refusal remains deliberate. No lexical forms were duplicated.

## Izolowane wyniki weryfikacji

Wykonano rzeczywisty Engine w V8 (20/20 zdań + 5/5 odmów), osobno adapter z produktywną morfologią (2/2 przykładów `window/okno`) i 15/15 komórek generowania i analizy odwrotnej, wraz z `assertLegacy:true`. Nie uruchomiono pełnego `npm test` w kompletnym checkoutcie; `startup_failure` blokuje Actions.

## Cross-batch compositionality tests

`tests/fixtures/gold-a1-crossbatch.json` holds **11 independently authored examples** of abilities, obligations, polar/WH modal questions, two-clause coordination and two-event discourse, combining `father`, `write`, `open`, `read`, `help` and `go`. Each row asserts source text, expected target text, semantic operator scope or ordered event concepts, target reanalysis and CORE JSON roundtrip. Tests reject intentionally corrupted oracle entries. The `check:gold-actions` CLI now runs both daily-action and cross-batch Node tests. These finite examples are not unrestricted A1 conversation or a CEFR score.
