# flexLingua: declarative grammar and features v0.3

This specification describes a **controlled-language prototype**, not a grammar for unrestricted English, Polish or arbitrary languages. It replaces the three-slot `sentence.order` / `frames.*.constructions` representation in grammar v0.2 with **semantic-role linearizations** and introduces a **shared feature registry** with scoped dependencies.

## Strictly separate data layers

| Path | Meaning |
| --- | --- |
| `data/concepts.json` | Language-neutral concepts and event frame roles, e.g. `agent`, `theme`, `recipient` |
| `data/features.json` | Language-neutral inventory of semantic and grammatical feature names/values |
| `data/{en,pl}.json` | Surface lexemes, singular/plural forms, lexical gender/Polish agreement class |
| `data/grammar/{en,pl}.json` | Language-specific case policies, determiners, verb form selection, agreement dependencies and linearization templates |
| `js/core/features.js` | Registry validation, non-mutating feature unification, dependency reading |
| `js/core/grammar.js` | Shared parser and surface realizer, **no language-name branches** |

New languages still need forms and rules; this prototype is not a ready-made universal parser. JSON does not run code (`eval`/`new Function`/dynamic regex are not supported).

## Semantic features versus grammatical features

`data/features.json` contains value domains:

```json
{
  "version": "0.3",
  "domains": {
    "event": {
      "tense": ["past", "present"],
      "polarity": ["positive", "negative"],
      "aspect": ["perfective", "imperfective", "unknown"]
    },
    "participant": {
      "number": ["singular", "plural"],
      "definiteness": ["definite", "indefinite", "unknown"]
    },
    "lexical": {
      "gender": ["masculine", "feminine", "neuter"],
      "pluralClass": ["virile", "nonvirile"]
    },
    "syntactic": {
      "case": ["nom", "gen", "dat", "acc"]
    }
  }
}
```

The semantic document version is **Interlingua v0.2**. Its event features are `tense`, `polarity`, `aspect`; each participant has a concept ID and `number`/`definiteness`. *Case, lexical gender, word order and Polish agreement class are not semantic facts*, and therefore do not leak into the Interlingua document. An `unknown` definiteness/aspect is not silently resolved in the meaning object; a target default is a realization decision with optional warnings/alternatives.

All semantic feature domains are validated against the JSON registry rather than JS `Set` literals. Values and conditions are finite and explicit, never code expressions. New number or tense **values** can be introduced through the registry and corresponding dictionary/grammar rules without changing JS (see tests for toy `dual` and `future`). New feature **dimensions** that require source extraction or realization may still need interpreter work.

## Grammar v0.3 example: flexible word order

```json
{
  "frames": {
    "event.visual_perception": {
      "cases": { "agent": "nom", "theme": "acc" },
      "linearizations": [
        ["agent", "@verb", "theme"],
        ["theme", "@verb", "agent"],
        ["agent", "theme", "@verb"]
      ]
    }
  }
}
```

- Each semantic role occurs **exactly once** per linearization, and exactly one `@verb` slot is required. The engine checks this against the frame ontology before the language is registered.
- `@verb` is a distinguished slot, expanded from the verb rule's prefix and inflected form.
- Any other `@word` is a fixed function word in the selected linearization; `@to` is used by English double-object/prepositional dative constructions.
- All listed linearizations are analyzed, in declaration order. The **first** is the preferred realization form.
- An utterance is accepted only when a complete lexical/grammatical match consumes the entire sentence and its agreement/condition checks pass.
- There are no predefined SVO/SOV/VSO conditionals in JS; templates express these arrangements declaratively. This does **not** yet model free word order, scrambling, discontinuous constituents or multi-clause trees.

## Noun number, case and determiners

English noun path: `"forms.{number}"`; Polish: `"forms.{number}.{case}"`. For example, Polish plural `forms.plural.gen = "książek"`; a grammar policy applies `acc → gen` to the object of a negated verb. Number comes from the *semantic referent*, case from the *target syntax*.

Determiners are declared per grammatical number:

```json
{
  "nounPhrase": {
    "path": "forms.{number}",
    "allowBare": false,
    "determiners": {
      "singular": {
        "definite": { "literal": "the" },
        "indefinite": { "lexemeProperty": "indefiniteArticle" }
      },
      "plural": {
        "definite": { "literal": "the" },
        "indefinite": { "omit": true }
      }
    },
    "defaultDefiniteness": "indefinite",
    "alternativeDefiniteness": "definite"
  }
}
```

The `omit: true` entry means a *zero determiner*, not an empty string or a missing required mapping. In this small model bare English plural NPs are analyzed as indefinite; in unrestricted English, they can also be generic or context-dependent. Missing definiteness in Polish remains `unknown` and leads to target default choices.

## Conditional verb rules and generic agreement

Rules can condition on a feature source (`subject.number`, `subject.gender`, `subject.pluralClass`, `event.tense`, `event.polarity`, `event.aspect`), with feature names checked against the registry. The selected rule supplies a form path, optionally enumerating placeholder bindings:

```json
{
  "verb": {
    "agreement": {
      "subjectGender": "subject.gender",
      "subjectPluralClass": "subject.pluralClass"
    },
    "rules": [
      {
        "tense": "past", "polarity": "positive",
        "when": { "subject.number": "plural" },
        "prefix": [],
        "path": "forms.past.plural.{subjectPluralClass}"
      }
    ]
  }
}
```

`subject.number` comes from Interlingua; `subject.gender` / `subject.pluralClass` come from the **selected subject lexeme**. The compiler expands a declarative form path into word forms and bindings, then checks bindings against the sources through non-mutating feature unification. Example: lexical class `virile` → `widzieli`; `nonvirile` → `widziały`.

For English, `subject.number = singular` selects `sees` / negative `does not see`, while plural selects `see` / `do not see`. Tense/polarity and condition combinations must be unique. Case alternation conditions currently accept only `event.*`, so they can be resolved before all participants have been read.

## Supported data safety rules

- Identifiers and path segments accept ASCII identifiers only (`foo`, `subjectNumber`) and reject `__proto__`, `prototype`, `constructor`; this restriction protects JSON-driven property traversal. Surface words support Unicode letters.
- Forms are ordinary dictionary strings; grammar JSON cannot evaluate JavaScript.
- Invalid source sentences and unsupported morphological combinations throw explicit errors; the engine never produces a guessed translation.
- Conflicting feature bindings return `null` from `unifyFeatures()`; the originals are not mutated.
- The parser uses deterministic first-complete-analysis selection rather than an ambiguity forest or statistical disambiguation.

## Migration from v0.2

1. Load `data/features.json` alongside ontology/dictionaries/grammars; construct `new Engine(ontology, features)`.
2. Set dictionary and grammar `version` to `"0.3"`.
3. Replace `sentence.order` and frame `constructions` with each frame's `linearizations`. A v0.2 SVC frame `['recipient','theme']` becomes `['agent','@verb','recipient','theme']`.
4. Replace `nounPhrase.path: forms.singular...` with `forms.{number}...`; group English determiner rules under `singular` and `plural`.
5. Provide plural forms and any relevant `pluralClass` metadata. Add conditional `verb.rules[*].when` and `verb.agreement` sources for agreement-dependent forms.
6. Update manually-constructed semantic nodes from Interlingua version `0.1` to `0.2` and register/validate new feature values.

## Deliberate limitations / next milestones

The prototype handles one lexical event, a finite noun/verb lexicon, nominative/dative/accusative/genitive, singular/plural, present/past, polarity and narrow aspect. It does not handle adjectives, pronouns, subordinate clauses, free morphology, multi-event graphs, animacy beyond hard-coded lexical metadata, coreference, discourse context, comprehensive ambiguity handling or complete English/Polish grammar. Do not infer broad translation coverage from passing the controlled fixture tests. The next major milestone is an explicit **compositional phrase tree / multi-event semantic representation**, more precise lexical senses, and typed optional features with provenance.
