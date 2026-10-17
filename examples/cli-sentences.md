# Manual CLI sentence examples

These commands are for human review, not an automated oracle. Compare the expected meaning with the observed JSON, including roles, referents, tense, aspect, polarity, quantity, alternatives, information loss, diagnostics, and process exit code.

## Evidence run

The expected readings below were recorded in issue [#297](https://github.com/clickbytes/flexLingua/issues/297) before running the CLI. Observations were collected from a terminal on 2026-10-17 at `main@90ccb01fb203a0b3847f9f2fbcf95bddf7294f0a`. Each sentence result is from `node tools/translate.mjs`; provider checks are reported separately.

## Package discovery

```sh
node tools/translate.mjs --languages --json
```

**Expected:** PL, EN, FI, TR, IT, and AR are listed; TR declares `tr->en`; AR is morphology-only.  
**Observed:** status `ok`; all six packages are listed, TR direction is `tr->en`, AR has no sentence direction and reports `morphology-only`; diagnostics `[]`; exit 0.

## Sentence cases

For refusals, a null meaning/text is the observed result, not a successful translation. The CLI returns exit 2 for controlled unsupported or ambiguous outcomes and exit 1 for infrastructure errors.

| # | Exact CLI command | Expected MeaningGraph or status (pre-run) | Observed result | Diagnostics; exit |
|---|---|---|---|---|
| 1 | `node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json` | `event.visual_perception`; agent `person.girl` singular, theme `animal.dog` singular; present, positive. | `Dziewczynka widzi psa.`; graph has singular definite agent and theme, present positive. | No diagnostics. Both definiteness values are reported as unavoidable loss. Exit 0. |
| 2 | `node tools/translate.mjs --from pl --to en --text "Dziewczynka widzi psa." --json` | `event.visual_perception`; singular girl agent and singular dog theme; present positive; source definiteness unspecified. | `A girl sees a dog.`; graph has singular agent and theme with definiteness unknown; present positive, imperfective. Alternative: `The girl sees the dog.` Aspect loss is unavoidable; both determiner choices are marked ambiguous. | No diagnostics. Exit 0. The pre-run issue note briefly suggested plural compatibility; that was an incorrect reading. The original matrix expectation was singular and the observed graph confirms it. |
| 3 | `node tools/translate.mjs --from en --to pl --text "This is a simple book." --json` | `state.classification`; demonstrative subject; category `object.book` modified by `quality.simple`; present positive. | `To jest prosta książka.`; observed graph has the expected demonstrative subject and modified book category. | No diagnostics or information loss. Exit 0. |
| 4 | `node tools/translate.mjs --from pl --to en --text "To jest prosta książka." --json` | `state.classification`; demonstrative subject; category `object.book` with `quality.simple`; present positive; category definiteness unspecified. | `This is a simple book.`; observed graph matches; category definiteness remains unknown and English determiner choice is reported as ambiguous. | No diagnostics. Exit 0. |
| 5 | `node tools/translate.mjs --from en --to fi --text "A girl looks at a house." --json` | `event.visual_attention`; girl agent, house target; present positive; expect Finnish realization with definiteness loss. | Controlled refusal; no text or meaning. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 6 | `node tools/translate.mjs --from fi --to en --text "Tyttö katsoo taloa." --json` | `event.visual_attention`; girl agent, house target; present positive; source definiteness unspecified. | Controlled refusal; no text or meaning. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 7 | `node tools/translate.mjs --from tr --to en --text "Kız köpeği gördü." --json` | `event.visual_perception`; girl agent, dog theme; past positive; preserve any definiteness ambiguity. | `A girl saw the dog.`; graph has an unknown-definiteness girl agent and definite dog theme, past positive. Alternative: `The girl saw the dog.` | No diagnostics. Agent definiteness is marked ambiguous. Exit 0. |
| 8 | `node tools/translate.mjs --from it --to en --text "La ragazza vede il cane." --json` | `event.visual_perception`; definite girl agent and definite dog theme; present positive. | `The girl sees the dog.`; observed graph matches. | No diagnostics or information loss. Exit 0. |
| 9 | `node tools/translate.mjs --from tr --to en --text "Kız köpeği gördü mü?" --json` | Controlled refusal for unsupported interrogative; no invented meaning or text. | `unsupported`; text and meaning are null. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 10 | `node tools/translate.mjs --from it --to en --text "La ragazza vede il cane?" --json` | Controlled refusal for unsupported interrogative; no invented meaning or text. | `unsupported`; text and meaning are null. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 11 | `node tools/translate.mjs --from it --to en --text "La ragazza vide il cane." --json` | Controlled refusal if the package does not implement this past construction; otherwise a past `event.visual_perception`. | `unsupported`; text and meaning are null. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 12 | `node tools/translate.mjs --from en --to it --text "The girl sees the dog." --json` | Direction/capability refusal; no meaning or text. | `unsupported`; text and meaning are null. | `PLUGIN_CAPABILITY_UNAVAILABLE`. Exit 2. |
| 13 | `node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json` | Direction refusal; no meaning or text. | `unsupported`; text and meaning are null. | `PLUGIN_DIRECTION_UNAVAILABLE`. Exit 2. |
| 14 | `node tools/translate.mjs --from ar --to en --text "الفتاة ترى الكلب." --json` | Direction refusal; no meaning or text. | `unsupported`; text and meaning are null. | `PLUGIN_DIRECTION_UNAVAILABLE`. Exit 2. |
| 15 | `node tools/translate.mjs --from en --to pl --text "I is reading a book." --json` | Controlled refusal for subject–verb agreement mismatch; no meaning or text. | `unsupported`; text and meaning are null. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 16 | `node tools/translate.mjs --from en --to pl --text "Three girls see the dog." --json` | `event.visual_perception`; girl agent has exact quantity 3; singular definite dog theme; present positive. | Controlled refusal; exact-quantity sentence is not currently accepted. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 17 | `node tools/translate.mjs --from en --to pl --text "I see you." --json` | `event.visual_perception`; agent is deictic speaker (first-person singular), theme is deictic addressee (second-person singular); present positive. | Infrastructure error; no text or meaning. The intended deictic referents were not returned. | `INFRASTRUCTURE_ERROR` with the generic message “Translation infrastructure failed.” Exit 1. Follow up before relying on this discourse path. |
| 18 | `node tools/translate.mjs --from en --to pl --text "She sees him." --json` | With no antecedents in this single request, controlled refusal rather than invented referents. | `unsupported`; text and meaning are null. | `LANGUAGE_CONSTRUCTION_UNSUPPORTED`. Exit 2. |
| 19 | `node tools/translate.mjs --from en --to pl --text "The girls read the book." --json` | Ambiguous `event.read`: plural definite girl agent, singular definite book theme; present or past. | Status `ambiguous`; no chosen text or meaning. The two alternatives are `event.read` with identical roles, one past and one present. | `AMBIGUOUS_MEANING` (“Source has 2 distinct semantic readings.”). Exit 2. |
| 20 | `node tools/translate.mjs --from en --to pl --text "The girl sees,, the dog." --json` | Controlled refusal for malformed source input; no invented meaning or text. | `unsupported`; text and meaning are null. | `SOURCE_CHARACTER_UNSUPPORTED`. Exit 2. |

## Morphology provider checks

These are provider checks, not sentence translations, so they have no sentence MeaningGraph. Each command compiled the provider's finite paradigms in memory; no output table was written.

| Command | Observed provider coverage | Generated sample forms |
|---|---|---|
| `node tools/compile-language.mjs en` | 181/181 eligible lexemes, 100%, 431 forms, no missing lexemes; exit 0. | `en.girl.1`, plural → `girls`. |
| `node tools/compile-language.mjs pl` | 182/182 eligible lexemes, 100%, 2598 forms, no missing lexemes; exit 0. | `pl.pies.1`, singular accusative → `psa`. |
| `node tools/compile-language.mjs fi` | 1/6 eligible lexemes, 16.67%, 20 forms; missing `fi.girl.1`, `fi.book.1`, `fi.dog.1`, `fi.cat.1`, `fi.katsoa.1`; exit 0. | `fi.house.1`, singular partitive → `taloa`. |
| `node tools/compile-language.mjs ar` | 1/1 eligible lexemes, 100%, 2 forms, no missing lexemes; exit 0. | `ar.kataba.1`, third-person masculine singular past → `كَتَبَ`; present → `يَكْتُبُ`. |

The sample forms were also requested directly from each loaded provider's `morphology.generate({lexemeId, features})` method in a temporary ESM terminal script; that script was removed after the check.
