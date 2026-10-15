# Turkish adapter scope audit

The Turkish (`tr`) package is a **demonstration only** of the shared CORE adapter.
It is not part of the Polish/English A1 evaluation and has no CEFR level claim.
The package uses original local declarative data and the same rule interpreter as
EN and PL; `js/languages/tr.js` only checks the data language before creation.

| Inventory | Declared scope |
| --- | --- |
| Lexicon | 6 nouns, 2 verbs, no adjectives, quantifiers, attitudes, function words, or modals |
| Nominal forms | Singular and plural; nominative, accusative and dative for each noun (36 table cells) |
| Verb forms | Past/present, positive/negative for each verb (8 table cells) |
| Event frames | Visual perception and transfer of possession |
| Syntax | SOV order; accusative for definite objects, bare nominative for indefinite objects; dative recipient |
| Productive morphology | No `data/morphology/tr.json` package; surface forms are listed in `data/tr.json` |

The package has no declared question grammar, relative clauses, quantified or
modified noun phrases, propositional complements, states, modality, anaphora,
or wide-scope negation. Unknown constructions fail visibly. Ambiguous source
definiteness can trigger a warning when Turkish object case uses its default.
The historical EN↔TR examples and negative cases are checked in
`tests/v1.test.js` and `tests/tr-audit.test.js`. This is a small fixed regression
sample, not a representative proficiency benchmark.
