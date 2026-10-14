# Batch B — v1.19: questions, negation and modality

## Status

Work in progress. This document is the acceptance contract for the first Batch B increment; the features below are not considered implemented until the parser, realization, tests and standalone build all pass.

## Semantic contract

A question is a distinct node in the language-independent representation, not merely an event with a question mark. The initial schema should support:

- `yes_no`: asks whether a proposition is true;
- `wh`: asks for one semantic role, such as `agent`, `theme`, or a configured location/time role;
- an explicit `targetRole` when the question seeks a participant;
- the proposition/event being queried;
- preservation of tense, polarity and existing participant references.

Surface realization belongs to each language package. English and Polish word order, auxiliaries, case and punctuation must not be encoded as English-shaped fields in CORE.

## Initial acceptance examples

These examples are now supported in the controlled grammar, subject to existing lexical/inflection limits. The Polish→English article choice is underspecified and yields alternatives:

| English input | Polish output | Semantic target |
|---|---|---|
| Does the girl see the dog? | Czy dziewczynka widzi psa? | yes/no question over an event |
| Who sees the dog? | Kto widzi psa? | interrogates `agent` |
| What does the girl see? | Co widzi dziewczynka? | interrogates `theme` |
| Czy dziewczynka widzi psa? | Does a girl see a dog? (alternative: Does the girl see the dog?) | same event, unknown Polish definiteness |

## Required tests

1. Analyze and realize the same question in both directions.
2. Distinguish yes/no questions from wh-questions and retain the queried role.
3. Preserve polarity and tense under question formation.
4. Reject unsupported question patterns with an explicit diagnostic.
5. Keep declarative parsing unchanged and preserve existing CORE graph validation.
6. Regenerate and verify both standalone HTML builds; run the full regression suite.

## Guardrails

- Do not infer a wh-role from punctuation alone.
- Do not claim unrestricted question understanding: implement a documented controlled grammar.
- Do not guess missing lexical or grammatical information.
- Keep language-specific linearization in `data/grammar/{en,pl}.json` and semantic structure in the shared core.

## Completion definition

v1.19 is complete only when implementation, bidirectional examples, negative tests, release checks, standalone offline behavior, documentation and one atomic GitHub publication are verified. A documentation-only commit does not complete v1.19.

## Implementation checkpoint — 2026-10-12, Task 3

**Implemented in source:** new semantic `question` document `version:'1.19'`, `questionType:'yes_no'|'wh'`, `proposition` and an explicit `targetRole` for WH questions. The interrogated role is **absent** from the event's `roles`, not filled with a dummy entity. CORE JSON validation and round-trip now accept valid question documents. Invalid missing/extra roles and malformed frames are rejected.

**Historical status at Task 3:** Polish/English surface parsing and generation were not yet implemented at that checkpoint. See the newer Task 4/5 checkpoint below. Modal questions, full Node release verification and offline bundling are still pending. **v1.19 is not complete.**

[Semantic contract and tests](questions-v1.19-semantic.md) · `tests/question-semantics.test.js`.

**Offline coordination:** Because another agent owns GUI files, this update does not modify or regenerate HTML. The standalone build must be synchronized and validated before release.

## Implementation checkpoint — 2026-10-12, Tasks 4 and 5

**Implemented in source:** controlled PL/EN parser and realizer for yes/no and wh (`agent`/`theme`) questions through INTER, English `do/does/did`, Polish `czy/kto/co/czego`, tense and local polarity, gender/number agreement and preserved lexical ambiguity.

**Independent regression fixtures:** `tests/fixtures/gold-questions-v1.19.json` contains 12 EN→PL, 10 PL→EN and 9 unsupported samples. Dedicated test suite: `npm run check:questions`.

**Still open:** free-form interrogatives, modal verbs, indirect questions, unsupported roles/frames, full Node regression and standalone synchronization by the separate GUI agent. See [full controlled-language contract](questions-v1.19-pl-en.md).
