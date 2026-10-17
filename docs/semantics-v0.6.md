# flexLingua Interlingua v0.6 — recursive clauses and scope

The semantic intermediate representation is **not an English AST** or a Polish sentence tree. This document specifies the bounded clause operators added in v0.6; it does not claim unconstrained language understanding.

## Three complementary structures

1. **Relative clauses** qualify a referent with a second event and an explicit missing semantic argument (`gap`).
2. **Coordination** groups independent clauses with a logical `and`. This is not the same as an ordered discourse (`precedes`).
3. **Wide-scope negation** wraps an entire coordination; it does not modify just one member's `event.features.polarity`.

Event documents without relative clauses keep version `0.2` or `0.5`, and older discourse graphs keep `0.4` or `0.5`. Documents requiring the new operators are marked `0.6`. Feature registry remains v0.3; the dictionary/grammar schemas are v0.6.

Ordered discourse preserves each event's optional `timeReference`, `clockTime`, and `calendarDate` independently. Numeric clock/date discourse uses version `1.25`; materializing an event restores the complete validated event without moving temporal fields between events. Unknown event fields are rejected instead of being silently discarded.

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

The two placeholder events above illustrate only the structure: real events **must contain complete semantic roles and feature bundles**. Use `createCoordination([completeClause1, completeClause2])`. The number of child clauses is 2–4. Each child may be a complete event, modal clause, scoped clause, comparison, or finite propositional complement. Nested coordinations are rejected. Connector spellings are in `data/grammar/{en,pl}.json` (`and` / `i`). A coordination is not converted into two independent discourse entities and is not an event sequence. Each member retains its own polarity and participant references; shared identity must be represented explicitly rather than inferred from spelling.

The PL/EN parser uses bounded chart-style spans to find complete coordinated
clauses. A coordinated complement such as “The girl believes that the boy sees
the dog and the boy believes that the girl sees a cat” is represented as
`coordination(complement(event), complement(event))`. Relative clauses inside
the embedded event keep their explicit role gap. Analysis is capped at 16
candidate readings, four coordinated clauses, and the existing CORE clause
tree depth; over-limit or malformed spans are rejected.

## Passive event realization (CORE 1.29)

The bounded passive construction currently covers past `event.open` clauses in
PL and EN. CORE retains the same `agent` and `theme` role mapping as the active
event and records `voice:'passive'` so the target can use its passive agreement
paradigm. An omitted external agent is absent from `roles` and listed in
`omittedRoles:['agent']`; no actor is fabricated. A known but unidentified
person can instead be represented explicitly as `person.unknown`. EN uses
`was/were opened`; PL tables the auxiliary and participle across singular
gender and plural class. Other passive tenses, event frames, passive clauses
with local negative polarity and relative-clause themes are rejected until configured.

## Real conditionals (CORE 1.30)

`conditional` stores a present, affirmative condition, its consequence, and an
optional `otherwise` branch. The current real period allows present or future
consequences; modal consequences retain their own scope. Its branches are
propositions, not committed event assertions. Negating the whole conditional
uses `scope(not, conditional)`, distinct from a negative event in the
consequence. Hypothetical and mixed tense periods are rejected until modeled.

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
- No relative-clause coordination, conditionals, temporal subordinators, arbitrary coreference or ellipsis. Finite `that/że` complements are limited to configured belief predicates and supported event/modal content.
- Text-level coordination uses chart-checked spans separated by the configured word; it is not general syntactic parsing. Nested coordination and unsupported uses of the marker are rejected.
- Morphological paradigms, lexical inventory and article selection are still a deliberately small demonstration.
- The familiar `.analyze()` method gives the preferred reading; `.analyzeCandidates()` exposes bounded semantic ambiguity. Maximum 16 readings; exhaustive ambiguity is not guaranteed.
