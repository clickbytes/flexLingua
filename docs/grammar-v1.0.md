# Grammar metadata v1.0

Each language has a `data/<code>.json` lexicon and `data/grammar/<code>.json` rule set with matching `version: "1.0"` and `language` identifiers. The JSON is validated when the adapter is created and when it is registered against the ontology/feature registry.

## Matrix complement

The lexicon optionally contains an `attitudes` array:

```json
{"id":"en.believe.1", "concept":"event.belief", "lemma":"believe",
 "forms":{"present":{"singular":"believes","plural":"believe"},
          "past":{"singular":"believed","plural":"believed"}}}
```

For an inflected target like Polish, a number form may map to gender (`singular`) or plural class (`plural`). The grammar supplies `sentence.complement` with an unambiguous marker such as `that` or `że`, a `comma` setting and optional `subjectCase`. The parser recognizes a **finite NP + predicate + marker + embedded clause** and recursively calls the shared clause engine. These are controlled complement constructions, not a general subordinate clause parser. Only `event.belief` is included in the initial ontology; new concepts require matching ontology, lexicon and grammar metadata.

## Conditional syntactic case

A frame role may use either a fixed case (`"agent":"nom"`) or a case map:

```json
{"theme":{"definite":"acc", "indefinite":"nom", "unknown":"acc"}}
```

The frame's linearizations are ordered slots, e.g. Turkish `agent,theme,@verb` and transfer `agent,recipient,theme,@verb`. The parser uses the observed case form to derive the theme's definiteness where the dictionary distinguishes forms. If definiteness is unknown while generating a Turkish object, the default case choice is reported as a warning. Do **not** treat case as a universal mapping of definite/indefinite in all Turkish constructions; this is a controlled prototype policy.

## Feature unification and other rules

Unchanged v0.3–0.6 mechanisms include a shared registry of event/participant/lexical features, declarative verb form paths, role-specific case alternations, adjective agreement, quantifier layouts and bounded relative clauses. Turkish `nounPhrase.relatives.maxDepth: 0` explicitly declares lack of support. There is no custom morphology function in the Turkish adapter.

All user-supplied Interlingua documents are validated before realization. Paths and declarative placeholders are strictly validated; there is no dynamic JavaScript evaluation in the rule interpreter.
