# flexLingua Interlingua v0.6 — recursive clauses and scope

The semantic intermediate representation is **not an English AST** or a Polish sentence tree. This document specifies the bounded clause operators added in v0.6; it does not claim unconstrained language understanding.

## Three complementary structures

1. **Relative clauses** qualify a referent with a second event and an explicit missing semantic argument (`gap`).
2. **Coordination** groups independent clauses with a logical `and`. This is not the same as an ordered discourse (`precedes`).
3. **Wide-scope negation** wraps an entire coordination; it does not modify just one member's `event.features.polarity`.

Event documents without relative clauses keep version `0.2` or `0.5`, and older discourse graphs keep `0.4` or `0.5`. Documents requiring the new operators are marked `0.6`. Feature registry remains v0.3; the dictionary/grammar schemas are v0.6.

## Event with a relative clause

```json
{
  "version": "0.6",
  "type": "event",
  "concept": "event.visual_perception",
  "features": { "tense": "past", "polarity": "positive", "aspect": "unknown" },
  "roles": {
    "agent": {
      "concept": "person.girl",
      "features": { "number": "singular", "definiteness": "definite" },
      "relatives": [{
        "type": "relative",
        "gap": "agent",
        "event": {
          "concept": "event.visual_perception",
          "features": { "tense": "past", "polarity": "positive", "aspect": "unknown" },
          "roles": {
            "theme": {
              "concept": "animal.dog",
              "features": { "number": "singular", "definiteness": "definite" }
            }
          }
        }
      }]
    },
    "theme": {
      "concept": "object.book",
      "features": { "number": "singular", "definiteness": "definite" }
    }
  }
}
```

Meaning: *the girl who saw the dog saw the book*. The missing `agent` of the embedded event is **explicitly identical to the containing referent**. It is not a repeated noun or an automatically inferred coreference. Object gaps use `"gap":"theme"` and omit `theme` instead.

A relative `event.roles` must enumerate **all frame roles except exactly the gap**. The `gap` must be declared in the event frame and the antecedent concept must satisfy any ontology role-type restriction on that gap. Nested referents, quantifiers and degrees retain their earlier validation rules. Recursion is limited to two relative-clause levels, two relative clauses per referent and eight events per legacy discourse. The text parser recognizes one relative per noun phrase at a time; manually assembled, validated graphs can express two.

To construct this shape without hand-assembling roles:

```js
const embedded = createEvent('event.visual_perception', {
  agent: participant('person.girl','definite'),
  theme: participant('animal.dog','definite')
}, {tense:'past',polarity:'positive',aspect:'unknown'});
const ref = participant('person.girl','definite','singular',{
  relatives: [createRelativeClause(embedded,'agent')]
});
```

The helper removes the gap argument and retains the other semantic roles. Realization and parsing use declarative target-language marker rules plus the **same shared frame interpreter** used for main clauses.

## Coordination

```json
{
  "version": "0.6",
  "type": "coordination",
  "connective": "and",
  "clauses": [
    { "version":"0.2", "type":"event", "concept":"event.visual_perception", "roles": {}, "features": {} },
    { "version":"0.2", "type":"event", "concept":"event.visual_perception", "roles": {}, "features": {} }
  ]
}
```

The two placeholder events above illustrate only the structure: real events **must contain complete semantic roles and feature bundles**. Use `createCoordination([completeEvent1, completeEvent2])`. The number of child event clauses is 2–4; nested coordinations are deliberately rejected until they can be parsed without losing structure. Connector spellings are in `data/grammar/{en,pl}.json` (`and` / `i`). A coordination of events is not converted into two independent discourse entities and is not an event sequence. Each member retains its own polarity and participant references; shared identity must be represented explicitly rather than inferred from spelling.

## Operator precedence and scope

```text
not(and(event A, event B))        !=     and(not(event A), event B)
```

The former is represented by:

```js
createNegation(createCoordination([eventA, eventB]))
```

This yields `{version:'0.6', type:'scope', operator:'not', operand:{type:'coordination', ...}}` and is realized by a language-specific *wide negation* prefix (`It is not true that` / `Nie jest prawdą, że`). The second expression uses `features.polarity:'negative'` on event A only.

These are **constrained, unambiguous semantic trees**; arbitrary propositional logic and scope ambiguity resolution are NOT implemented. Explicit universal/exact nominal quantifiers still describe participant-level semantics and do **not** introduce a general `∀`/`∃` scope calculus. Multiple-sentence input combining coordination with legacy discourse is currently rejected rather than flattened incorrectly.

## Examples

| English | Polish |
| --- | --- |
| The girl that saw the dog gave the boy a book. | Dziewczynka, która widziała psa, dała chłopcu książkę. |
| The boy that the girl saw gave the dog a book. | Chłopiec, którego dziewczynka widziała, dał psu książkę. |
| The girl saw the dog and the boy did not see a cat. | Dziewczynka widziała psa i chłopiec nie widział kota. |
| It is not true that the girl saw the dog and the boy saw the cat. | Nie jest prawdą, że dziewczynka widziała psa i chłopiec widział kota. |

## Deliberate limits

- Controlled language PL/EN only; this is not a general parser of arbitrary subordinate clauses.
- Gap roles currently include `agent` and `theme` in provided relative-marker tables. Arbitrary semantic roles can be validated but require an appropriate language-specific marker to be rendered.
- Relative nesting depth ≤2; quantifier scope is not a full semantic calculus.
- No relative-clause coordination, complement clauses (`that` as a sentential argument), conditionals, temporal subordinators, arbitrary coreference or ellipsis.
- Text-level coordination is recognized as top-level clauses separated by the configured word, not by general syntactic parsing. The marker within another construction can yield an explicit unsupported-construction error.
- Morphological paradigms, lexical inventory and article selection are still a deliberately small demonstration.
- The familiar `.analyze()` method gives the preferred reading; `.analyzeCandidates()` exposes bounded semantic ambiguity. Maximum 16 readings; exhaustive ambiguity is not guaranteed.
