# Declarative grammar format v0.2

`createRuleAdapter(dictionary, grammar)` interprets the same JSON format for every supported language. It compiles lists of lexical word forms and analyzes or generates controlled declarative sentences. The language wrappers in `js/languages/` contain **no linguistic decisions**.

## Dataset boundaries

- `data/concepts.json`: ontology, e.g. `event.transfer_possession` with semantic `agent`, `recipient`, `theme` roles. Identifiers are stable internal IDs, not translated English words.
- `data/<language>.json`: lexical senses and realized word forms. A noun has `concept`, `lemma` and `forms`; a verb has `concept`, `lemma` and `forms`, plus optionally an aspect.
- `data/grammar/<language>.json`: syntax and morphology **policies**. The same engine reads both EN and PL rules.

## Configuration fields

| Key | Interpretation |
| --- | --- |
| `version` | Must be `"0.2"` (grammar specification, *not* Interlingua version). |
| `language` | Must agree with lexicon `language` field. |
| `sentence.order` | Ordered permutation of `subject`, `verb`, `complements`; the complements slot must follow verb. Supports S-V-C and V-S-C. |
| `sentence.subjectRole` | Semantic role realized as the grammatical subject (currently `agent`). |
| `sentence.terminator` | Output sentence ending, normally `.`. |
| `nounPhrase.path` | Lookup path to inflected surface forms; e.g. `forms.singular`, `forms.singular.{case}`. |
| `nounPhrase.subjectCase` | Case assigned to subject in a case-marking language (e.g. `nom`). |
| `nounPhrase.allowBare` | Whether a bare singular noun phrase is accepted in analysis. |
| `nounPhrase.determiners` | Map `definite` / `indefinite` to a literal (e.g. `the`) or noun property (e.g. `indefiniteArticle`). |
| `nounPhrase.defaultDefiniteness` | Surface realization fallback when source semantic definiteness is `unknown`. |
| `nounPhrase.alternativeDefiniteness` | Optional alternative realization for unknown definiteness. |
| `verb.aspectSource` | `lexeme` retains source verb aspect; `unknown` does not claim to resolve it. |
| `verb.preferredAspects` | Default **surface choice** for a frame if source aspect is unknown. Does not alter Interlingua. |
| `verb.rules[]` | `tense`, `polarity`, literal `prefix[]`, and verb form `path`. Valid pairs currently present/past × positive/negative. |
| `cases.alternations[]` | Conditional substitutions, e.g. `acc → gen` when `polarity=negative`. |
| `frames[concept].cases` | Mapping from semantic roles to base grammatical cases (Polish). |
| `frames[concept].constructions` | Ordered role/literal sequences. First construction is generated; all listed constructions may be analyzed. |
| `messages` | User-facing parser/realizer warnings, configured per language. |

### Morphology paths

A form path reads **data, not code**. Literal path segments access keys in a lexeme record. A `{placeholder}` enumerates keys at that level and binds the key as a feature:

```json
{
  "path": "forms.past.singular.{subjectGender}"
}
```

This interprets lexical forms such as `forms.past.singular.feminine = "dała"`, associating the selected word form with a grammatical `subjectGender` binding. The generic interpreter checks the captured gender against the subject noun's lexical `gender`. For noun `forms.singular.{case}` the interpreter selects the case required by the frame and polarity rules.

Paths accept only identifier keys and placeholders. Paths containing forbidden property names such as `__proto__` or `constructor` are rejected. No dynamic expressions or scripts can be embedded in JSON.

### Function words and construction patterns

```json
{
  "constructions": [
    ["recipient", "theme"],
    ["theme", "@to", "recipient"]
  ]
}
```

A role step triggers noun-phrase parsing or realization. A step beginning with `@` is a literal function word, such as English `to`. Constructions must cover each required **non-subject** semantic role exactly once; the adapter validates them against the ontology before registration. The first listed construction is the canonical generation preference.

### Case alternation

```json
{
  "cases": {
    "alternations": [
      {
        "when": { "polarity": "negative" },
        "from": "acc",
        "to": "gen"
      }
    ]
  }
}
```

The base case for each role comes from `frames[...].cases`; the alternation is applied afterward. The same policy is used to parse and generate negative sentences, avoiding code branches specific to Polish.

## Extension recipe

1. Add a semantic concept and semantic roles to the ontology.
2. Add language-specific lexemes, complete with surface forms, to each target language dictionary.
3. Put grammar policies and syntactic constructions in a language-specific grammar JSON file.
4. Register `createRuleAdapter(dictionary, grammar)` in the `Engine`.
5. Add a contract test that checks generation, analysis, and preservation of semantic roles.

To add a **new noun** to existing frames, steps 2 (and 1 if it is a new concept) usually suffice. To add a **new event**, steps 1–3 are needed. New grammatical phenomena outside the current schema require deliberately expanding the generic interpreter and updating the version.

## Deliberate v0.2 restrictions

This schema is not a general-purpose grammar engine. The interpreter supports singular nominal forms, one lexical verb, SVC/VSC, finite present/past, positive/negative polarity, lexical aspect and one selected construction with zero or more complements. It assumes the verb comes before its complements and cannot handle compound clauses, multi-event structures, full morphological paradigms, word-sense disambiguation or coreference. Some grammatical phenomena (e.g. case-conditioned noun agreement, animacy-conditioned verb forms, multiword inflection) are not yet modeled. The construction analyzer selects the first match rather than returning all parses.

**A future version should move beyond a fixed three-slot sentence template**, with an abstract syntax tree / graph, feature-unification constraints and explicit alternatives for ambiguous analyses.
