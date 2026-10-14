# flexLingua v0.5 — declarative noun phrase grammar and agreement

All morphology and slot order for supported adjectives, degree words and quantifiers is supplied by JSON. Neither `js/languages/en.js` nor `js/languages/pl.js` contains new grammar-specific code.

## Source files

- `data/concepts.json`: `quality.big`, `quality.small`, `quality.red` and `degree.very` are shared semantic concepts.
- `data/en.json`, `data/pl.json`: `adjectives[]`, `degrees[]`, `quantifiers[]` and existing `nouns[]`, `verbs[]`.
- `data/grammar/en.json`, `data/grammar/pl.json`: `nounPhrase.qualified.layouts`, `layoutByQuantifier`, agreement and determiner rules.
- `js/core/nominals.js`: the shared bounded parser and surface realizer for nominal phrases.
- `js/core/grammar.js`: the unchanged semantic-frame parser/linearizer now delegates nominal details to `nominals.js`.

## Surface form schema

`adjectives` and `degrees` have a stable lexical ID, semantic concept, lemma and array of form alternatives:

```json
{
  "id": "pl.big.adj.1",
  "concept": "quality.big",
  "lemma": "duży",
  "forms": [
    { "text": "duża", "when": { "number": "singular", "gender": "feminine", "case": "nom" } },
    { "text": "dużą", "when": { "number": "singular", "gender": "feminine", "case": "acc" } },
    { "text": "duzi", "when": { "number": "plural", "pluralClass": "virile", "case": "nom" } }
  ]
}
```

The actual `pl.json` has more forms for the supported cases, genders and plural classes. The condition object is **partial**: an omitted feature means the surface form does not depend on it (e.g. English adjectives). Condition keys are limited to registered features: `number`, `case`, `gender`, `pluralClass`, `animacy`.

A new lexical feature `animacy` makes Polish masculine singular accusative realizations of adjectives correct, e.g. `małego chłopca` (animate) vs `duży bank` (inanimate). The language-specific distinction lives in the lexical entries and agreement mapping, not in the semantic concept of visual perception.

### Quantifier lexemes

```json
{
  "id": "pl.two.quant.1",
  "meaning": { "kind": "exact", "value": 2 },
  "forms": [
    { "text": "dwaj", "when": { "number": "plural", "pluralClass": "virile", "case": "nom" } },
    { "text": "dwie", "when": { "number": "plural", "gender": "feminine", "pluralClass": "nonvirile", "case": "acc" } }
  ]
}
```

The corpus-independent lexicon uses the same quantifier meaning in EN (`two`) and PL (`dwa`, `dwie`, `dwaj`, `dwóch`, `dwóm`). A larger dictionary can add numerals without altering the semantic representation. The current parser does **not** model Polish numerals three and above or all their exceptional government/agreement patterns.

## Word order is configuration, not JS branching

English example:

```json
"qualified": {
  "layouts": [
    ["quantifier", "determiner", "modifiers", "noun"],
    ["determiner", "quantifier", "modifiers", "noun"]
  ],
  "layoutByQuantifier": { "universal": 0, "exact": 1 },
  "maxAdjectives": 3,
  "maxDegreeDepth": 2,
  "adjectiveOrder": "before",
  "degreeOrder": "before",
  "articleFromFirstModifier": true
}
```

- `all the small dogs` selects layout 0.
- `the two small cats`, `two small cats` select layout 1.
- `two the small cats` is rejected because it does not match the `exact` layout.
- `a big apple`, not `an big apple`: when the first adjective has a lexically specified article form, it overrides the noun's bare article. This is a **small controlled lexical phonology rule**, not a complete phonological analyzer.
- Polish example layout: `["quantifier", "modifiers", "noun"]`. Because Polish has no English-style mandatory articles, there is no determiner slot.

To experiment with other word orders, change the layouts and selection policy in the JSON. Layouts must end in `noun` and contain `quantifier` and `modifiers`; English layouts also require `determiner`. The prototype currently supports **prenominal** adjectives and **pre-adjective** degree markers only. `adjectiveOrder` and `degreeOrder` reject unsupported values rather than silently pretend to support postnominal languages.

## Parser and generator

Parsing:

1. Select a semantic frame and sentence linearization.
2. For each argument, match a qualified NP against configured slot sequences, a lexicon noun, its number/case forms, zero to three adjective properties, optional recursive degree prefixes, and an optional quantifier.
3. Check verb agreement and typed roles; create a language-neutral event/discourse. Preserve lexical sense IDs alongside the semantic graph.
4. Enumerate alternative semantic readings, bounded by the existing engine candidate limit.

Realization:

1. Resolve a semantic `Concept` to a language-local noun lexeme and its form for semantic number and syntactic case.
2. Read modifier concepts and quantifier meaning from the graph, select compatible adjective/degree/numeral form entries from lexical JSON.
3. Choose a slot layout according to the language's rule set, and apply the target determiner policy.
4. Compose the NP into the event's configured frame linearization.

The parser limits nominal exploration to 10,000 states per phrase (and the sentence parser has its existing search limits). This is an explicit MVP complexity control, not a scalable broad-coverage grammar algorithm.

## Examples covered

| EN | PL |
| --- | --- |
| The big girl saw two small cats. | Duża dziewczynka widziała dwa małe koty. |
| The very big boys saw the small girls. | Bardzo duzi chłopcy widzieli małe dziewczynki. |
| All the big boys saw two small books. | Wszyscy duzi chłopcy widzieli dwie małe książki. |
| The very big girls did not see all the small books. | Bardzo duże dziewczynki nie widziały wszystkich małych książek. |
| The boy saw a big apple. | Chłopiec widział duże jabłko. |

The source-language article may be lost when generating Polish text; the Interlingua version of the sentence retains source definiteness if known, but **reanalysing the Polish text cannot restore the English article**. The generator reports defaulting when necessary.

## Testing

`npm test` covers the old v0.2–v0.4 contract, new v0.5 construction tests, malformed grammars, agreement and role-preservation matrices, the HTML offline bundle without network requests, and static localhost HTTP serving. `npm run check:standalone` checks that the offline HTML remains exactly reproducible.

No complete browser visual test or production-scale corpus benchmark is claimed.
