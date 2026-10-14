# flexLingua v0.5 — qualified referents, recursive modifiers and quantifiers

## Scope

v0.5 adds structured properties and quantification to the existing language-neutral Interlingua participant model. The older event (`0.2`) and discourse (`0.4`) documents remain valid and are not silently rewritten. A document containing qualified participants uses version `0.5`.

This is **a controlled prototype**, not unrestricted semantic parsing. Recursion applies to a bounded *modifier tree* inside a nominal referent. Embedded relative clauses, subordinate events, semantic scoping of arbitrary quantifiers, anaphora, distributivity and generalized logical formulas are not yet implemented.

## Three separate semantic layers

1. **Identity:** the stable concept `person.girl` (the thing described).
2. **Properties:** one or more `property` nodes, optionally modified by `degree` nodes. The property/degree concepts are not language-specific adjectives/adverbs.
3. **Quantification:** `quantifier` independently marks universal quantification or an exact cardinality. `number` is still a grammatical/semantic feature of the referent and must be `plural` for the supported quantifiers.

```json
{
  "version": "0.5",
  "type": "event",
  "concept": "event.visual_perception",
  "roles": {
    "agent": {
      "concept": "person.girl",
      "features": { "number": "singular", "definiteness": "definite" },
      "modifiers": [
        { "concept": "quality.big", "modifiers": [{ "concept": "degree.very" }] }
      ]
    },
    "theme": {
      "concept": "object.book",
      "features": { "number": "plural", "definiteness": "unknown" },
      "modifiers": [{ "concept": "quality.red" }],
      "quantifier": { "kind": "exact", "value": 2 }
    }
  },
  "features": { "tense": "past", "polarity": "positive", "aspect": "unknown" }
}
```

Examples using this graph:

- EN (article policy): `The very big girl saw two red books.`
- PL: `Bardzo duża dziewczynka widziała dwie czerwone książki.`

## Ontology extension

`data/concepts.json` includes two new concept types:

```json
"quality.big": {
  "type": "property", "label": "large in size", "appliesTo": ["entity"]
},
"degree.very": {
  "type": "degree", "label": "high degree", "appliesTo": ["property", "degree"]
}
```

The validator rejects a degree directly modifying an entity, a property incorrectly modifying another property, unknown concept IDs, invalid inheritance, malformed nodes and attempts to insert source-language case/word-order into referents.

`modifiers` is an **ordered array**: it preserves lexical scope and adjective sequence until a future planner supports language-dependent reordering. Child modifiers apply to their immediate parent, not the entire sentence. They are validated recursively to a maximum of three levels (property + up to two nested degree modifiers), three sibling properties and nine total nodes. These are bounded MVP limits, not supposed cross-language universals.

## Quantifiers and definiteness

Supported meanings:

```json
{ "kind": "universal" }
{ "kind": "exact", "value": 2 }
```

Exact cardinality in the **semantic schema** is valid for integer values 2–20. The sample **lexicon** currently contains surface forms only for 2. Other exact counts are intentionally rejected at realization, not dropped or approximated. The demo models universal quantification only over plural referents. Singular distributive or mass-quantifier interpretations require a richer model.

Definiteness is distinct from quantity. Polish often leaves definiteness unmarked, while English may require an article. A Polish nominal `dwie książki` is therefore not forced to carry either `definite` or `indefinite`. Target realization may choose an article policy and report uncertainty, but never writes the choice back into Interlingua.

## Versions and compatibility

| Shape | Version | Status |
| --- | --- | --- |
| Plain single-event document | `0.2` | Supported unchanged |
| Plain ordered discourse | `0.4` | Supported unchanged |
| Event with qualified participants | `0.5` | Added |
| Discourse containing a qualified participant | `0.5` | Added |
| Feature registry | `0.3` | Existing registry, with optional `lexical.animacy` feature values |
| Lexicon and grammar config | `0.5` | New qualified-NP slots and inflection tables |

A document labelled `0.2` or `0.4` cannot smuggle `modifiers` or `quantifier` nodes without upgrading its version. Plain participants remain compatible with old APIs:

```js
participant('person.girl', 'definite'); // existing
participant('person.girl', 'definite', 'singular', {
  modifiers: [modifier('quality.big', [modifier('degree.very')])]
}); // new
```

`createEvent` and `createDiscourse` automatically select the version appropriate to their qualified referents. There is no automatic coreference inference, even when a description is repeated in the next sentence. To express identity, reuse discourse entity IDs explicitly.

## Failure modes and explicit limits

- Unknown modifier concepts and role-incorrect modifiers are errors.
- Empty, cyclic/oversized or excessively nested property descriptions are errors; the parser additionally bounds lexical search states.
- Exact quantification over singular referents is rejected in v0.5.
- Missing target-language words or inflected forms produce errors, not fallback translation pairs.
- Ambiguous noun senses remain distinct; `bank` continues to produce financial institution and riverbank semantic candidates even when modified by `red` or `big`.
- `all` is modelled as a nominal quantifier; this is **not** yet full quantifier-scope semantics (`every` vs `some` interactions, negation scope, distributivity, existential import).
- English and Polish adjective order and Polish plural agreement are example implementations, not claims about all languages.

Future directions include relative clauses and other nested predicates, generalized semantic operator scope, additional numeral classes (including Polish higher numerals), NP coordination, noun modifiers realized as PPs, and cross-language constituent order experiments.
