# flexLingua · Ontology, senses and discourse v0.4

## Scope

This version preserves the **Interlingua v0.2 single-event format** and adds a bounded **v0.4 discourse graph**. The lexicon becomes **sense-aware**: concepts are not English words, and a surface spelling can represent multiple distinct concepts. Rules for morphology, agreement, case and word order remain in JSON grammar definitions.

There is no LLM, probabilistic inference, internet service, backend, or pairwise phrase lookup. The source analyzer still accepts only a controlled subset of Polish and English.

## 1. Ontology data: `data/concepts.json`

An ontology is a dictionary of stable concept IDs with typed records:

```json
{
  "version": "0.4",
  "concepts": {
    "entity": { "type": "category" },
    "institution": { "type": "category", "parent": "entity" },
    "place.financial_institution": {
      "type": "entity", "parent": "institution",
      "relations": { "associated_with": ["object.money"] }
    },
    "event.perception": {
      "type": "event", "abstract": true,
      "roles": ["agent", "theme"],
      "roleTypes": { "agent": "entity", "theme": "entity" }
    },
    "event.visual_perception": {
      "type": "event", "parent": "event.perception"
    }
  },
  "relationTypes": {
    "associated_with": {
      "subject": "entity", "object": "entity", "symmetric": false
    }
  }
}
```

The excerpt omits other referenced concepts. In the full file, all referenced IDs exist. `parent` references are validated, cycles and incompatible parent types are rejected, and event frames inherit role names and constraints. A subtype may **tighten**, but cannot loosen, inherited role-type restrictions. Valid role participants must be instances/subtypes of the constraints.

Typed relations have `subject`, `object` (ontology types) and `symmetric`. For example, `place.riverbank` is `adjacent_to` `place.river`; the symmetric relation can be queried from either side. Relations on parent concepts can be inherited by their descendants. The ontology is copied and frozen during engine construction.

API:

```js
engine.ontology.isA('place.riverbank', 'geographical_feature'); // true
engine.ontology.ancestors('place.riverbank');
engine.ontology.frameRoles('event.visual_perception'); // ['agent','theme']
engine.ontology.relationTargets('place.river', 'adjacent_to');
engine.ontology.relatedToTopic('place.riverbank', 'place.river'); // true
```

These are **explicit semantic relations** in the hand-authored ontology. They are not evidence for arbitrary real-world inference.

## 2. Lexemes and lexical senses: `data/en.json`, `data/pl.json`

A **lexeme** is a language-specific word or expression with form tables; its **senses** link the lexeme to meaning IDs:

```json
{
  "id": "en.bank.1", "lemma": "bank",
  "forms": { "singular": "bank", "plural": "banks" },
  "indefiniteArticle": "a",
  "senses": [
    { "id": "en.bank.finance.1", "concept": "place.financial_institution", "priority": 2 },
    { "id": "en.bank.river.1", "concept": "place.riverbank", "priority": 0 }
  ]
}
```

Legacy one-sense entries with a top-level `concept` are accepted. A single lexeme must have **either** `concept` **or** non-empty `senses`, never both. Each lexical sense has a unique ID and maps to a known ontology concept. Two lexemes may map to the same concept (e.g. `dog`, `hound`); one lexeme may map to several concepts (`bank`). `priority` is an explicit deterministic editorial preference, not a learned frequency or likelihood. It is set per sense in the JSON and defaults to `0`.

Grammar adapters expand sense-bearing entries before running the same morphology and syntax interpreter. Creating new single-/multi-sense lexemes and new semantic concepts therefore requires **only JSON** as long as existing constructions can realize them. Different kinds of constructions still require relevant grammar definitions and, occasionally, new interpreter capabilities.

## 3. Alternative semantic readings

```js
const candidates = engine.analyzeCandidates({
  text: 'The girl saw a bank.', from: 'en'
});
// candidates[0].interlingua.roles.theme.concept === 'place.financial_institution'
// candidates[1].interlingua.roles.theme.concept === 'place.riverbank'
// candidates[i].lexicalSenses.theme is the corresponding lexical sense ID

const translated = engine.translate({
  text: 'The girl saw a bank.', from: 'en', to: 'pl'
});
// translated.text: 'Dziewczynka widziała bank.'
// translated.semanticAlternatives[0].text: 'Dziewczynka widziała brzeg.'
// translated.warnings warns about unresolved semantic ambiguity
```

`semanticAlternatives` are **different meanings**, whereas existing `alternatives` are **grammatical/surface realizations of one meaning** (e.g. perfective vs imperfective Polish realization when English aspect was not specified). Neither can be interpreted as a confidence score.

Call `engine.analyze(...)` to get only the first (preferred) reading; prefer `analyzeCandidates(...)` if losing ambiguity is unacceptable. Analysis is bounded to 16 readings per utterance and a finite parse-search budget. A result of 16 readings is *not* evidence that there are exactly 16 possible analyses.

### Context

You may filter by a known concept:

```js
engine.translate({
  text: 'The girl saw a bank.', from: 'en', to: 'pl',
  context: { senses: { theme: 'place.riverbank' } }
});
// Dziewczynka widziała brzeg.
```

Or provide ontology **topic hints**:

```js
engine.translate({
  text: 'The girl saw a bank.', from: 'en', to: 'pl',
  context: { topics: ['place.river'] }
});
// Dziewczynka widziała brzeg.
```

Topic hints add a deterministic ranking bonus for directly related/typed ontology concepts. They do not provide a general statistical or contextual word-sense disambiguation engine. Role-specific `context.senses` filters currently apply only to a single sentence. The source does not supply gender/definiteness/aspect values that are missing in its grammar; target defaults do not modify the semantic graph.

## 4. Multi-event discourse graph

Two or more independently parsed sentences produce one graph:

```json
{
  "version": "0.4",
  "type": "discourse",
  "entities": {
    "p1": { "concept": "person.girl", "features": { "number": "singular", "definiteness": "definite" } },
    "p2": { "concept": "animal.dog", "features": { "number": "singular", "definiteness": "definite" } },
    "p3": { "concept": "person.boy", "features": { "number": "singular", "definiteness": "definite" } },
    "p4": { "concept": "person.girl", "features": { "number": "singular", "definiteness": "definite" } },
    "p5": { "concept": "object.apple", "features": { "number": "singular", "definiteness": "indefinite" } }
  },
  "events": [
    {
      "id": "e1", "concept": "event.visual_perception",
      "roles": { "agent": "p1", "theme": "p2" },
      "features": { "tense": "past", "polarity": "positive", "aspect": "unknown" }
    },
    {
      "id": "e2", "concept": "event.transfer_possession",
      "roles": { "agent": "p3", "recipient": "p4", "theme": "p5" },
      "features": { "tense": "past", "polarity": "positive", "aspect": "unknown" }
    }
  ],
  "relations": [{ "type": "precedes", "from": "e1", "to": "e2" }]
}
```

Notice that `p1` and `p4` both have the concept `person.girl` but are **not** asserted to refer to the same girl. A caller may use the same ID to express that identity explicitly.

Input:

```text
The girl saw the dog. The boy gave the girl an apple.
```

Output:

```text
Dziewczynka widziała psa. Chłopiec dał dziewczynce jabłko.
```

`entities` are explicitly identified independently of lexical spellings. Repeated mentions are **not** automatically assumed to denote one referent: `The girl ... The girl ...` generates distinct entity IDs. A caller can manually reuse an entity ID in multiple event roles to express explicit coreference. Multi-event analysis is a bounded cartesian combination of sentence readings (up to 16 document readings), not discourse understanding or free-form syntax analysis.

Discourse validation checks entity references, complete event roles, event ordering, duplicate IDs, sequence relations and 2–8 event bound. The realizers currently emit one independent target sentence per event. Combined surface alternatives are omitted rather than enumerated exponentially.

## 5. Schema version notes

| Component | v0.4 |
| --- | --- |
| Ontology | `data/concepts.json`: `version: '0.4'` |
| Lexical dictionaries | `data/en.json`, `data/pl.json`: `version: '0.4'` |
| Language grammar configs | `data/grammar/*.json`: `version: '0.4'` |
| Feature registry | Still `version: '0.3'`; inventory structure unchanged |
| Single-event Interlingua | Still `version: '0.2'` (backwards compatible) |
| Multi-event discourse Interlingua | `version: '0.4'` |

The v0.4 grammar interpreter and dictionaries must be used together. Historical docs for v0.2/v0.3 remain as reference; do not mix data-contract versions. The `ontology` API also accepts legacy v0.1 concept catalogs when they satisfy the current validation requirements.

## 6. Honest limitations and next research targets

- Only a **controlled subset** of Polish/English is supported (`give`, `see`, selected noun lexemes); no arbitrary grammar, questions, modifiers, pronouns, subordination, speech acts or idioms.
- The represented semantic relations and topical boost are deliberately hand-authored; no robust WSD, entity linking, pragmatic inference, knowledge-base reasoning or contextual anaphora.
- A shared graph improves architecture; it does **not** ensure lossless A→B translation when target language requires absent information (articles, grammatical gender, evidentiality, etc.).
- Discourse graphs currently represent ordered independent sentences and explicit shared references, not clause-level dependency or temporal/logical entailment.
- The in-browser UI is an educational inspector; do not interpret a preferred candidate as the uniquely correct translation.

Recommended next step: richer semantic roles, optional/implicit arguments, adjective/adverb modification, quantification and reference resolution, while retaining explicit uncertainty and strict JSON validation.
