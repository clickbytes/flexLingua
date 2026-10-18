# ADR: typowany graf definicji konceptu

**Status:** accepted for the CORE data contract after TG-00 user approval. Runtime enforcement is introduced by TG-02 and sentence projection by TG-04.
**Scope:** rooted, language-neutral concept definitions in `data/core/concepts.json`; no parallel semantic registry and no unrestricted translation claim.

## Context

CORE concept IDs are stable references used by language lexicons and MeaningGraph records. A concept ID can identify a simple primitive or a richer meaning pattern. The existing ontology already has `parent`, typed relation signatures, event roles, and relation lookup. Plugin `graph.json` files describe language-package topology and are not semantic concept graphs.

An atomic-only concept model cannot distinguish meanings such as a material from contents, or a broad financial institution from the narrower concept `bank`. Replacing MeaningGraph would also lose sentence roles, reference, tense, aspect, polarity, and question scope.

## Decision

`data/core/concepts.json` remains the only canonical CORE ID registry. A concept may add these optional fields independently:

```json
{
  "definitionGraph": {
    "edges": [
      {"relation":"domain","target":"domain.finance","constraint":"required"},
      {"relation":"associated_with","target":"object.money","constraint":"typical","weight":0.6}
    ]
  },
  "semanticEffect": {
    "operation":"add_relation",
    "relation":"domain",
    "target":"domain.finance"
  }
}
```

The example shows the two shapes; `semanticEffect` belongs on a property concept and `definitionGraph` describes the concept whose ID is the implicit root. The fields are independently optional. The JSON Schema fragment at `schemas/typed-semantic-graph.schema.json` describes their structural shape. Runtime validation must also resolve every relation and concept ID and enforce type signatures; JSON Schema cannot validate cross-record references.

`parent` compiles to a hard, directed `is_a` edge. Do not repeat `is_a` in `definitionGraph`. Existing IDs, `coreRef` values, event roles, and MeaningGraph documents retain their meaning. `state.possession` remains the representation for possession; relation `owns` is not added.

## Relation vocabulary and signatures

The relation target IDs below are category roots in CORE. The domain roots and their child concepts are added only with reviewed CORE data and provenance. Relation direction is significant except for the existing symmetric relation.

| Relation | Subject type | Object type | Meaning |
| --- | --- | --- | --- |
| `domain` | `entity` | `domain` category | Subject's domain, such as finance |
| `material` | `entity` | `material` category | Material the subject is made of |
| `color` | `entity` | `color` category | Color of the subject |
| `purpose` | `entity` | `purpose` category | Intended function of the subject |
| `has_part` | `entity` | `entity` | Component belonging to the subject |
| `contains` | `entity` | `entity` | Contents held by the subject |
| `located_in` | `entity` | `entity` | Location of the subject |
| `adjacent_to` | `geographical_feature` | `geographical_feature` | Existing symmetric adjacency relation |
| `associated_with` | `entity` | `entity` | Existing directed association relation |

Every relation name must exist in `relationTypes`. A relation target must be an existing canonical CORE ID whose type is compatible with the relation's object signature. A concept root must satisfy the subject signature. Unknown IDs, wrong types, malformed records, duplicate semantic edges, and exceeded budgets are explicit validation failures. Relation edges are not ownership or sentence-state records.

## Required and typical edges

- `required` is a hard condition of the concept pattern and has no `weight` field.
- `typical` is a soft salience hint and must carry a manually justified numeric `weight` greater than 0 and at most 1. The number is not a probability, confidence, or corpus frequency. Do not invent a default weight when evidence is absent.
- Required edges and type constraints filter candidates. Typical edges may order candidates that remain compatible. A typical weight never licenses a type mismatch, turns a refusal into success, or selects one sense when multiple senses remain possible.

Examples: `institution` with a required `domain → domain.finance` edge describes a financial institution, but does not by itself prove `bank`. A `wooden box` has `material → material.wood`; a `box containing wood` has `contains → object.wood`. These patterns are not interchangeable.

## Property effects and sentence meaning

A `property` may declare `appliesTo` and `semanticEffect`. `add_relation` applies its relation to the compatible modified referent, provided the target and relation signature validate. For example, `quality.financial` can add `domain → domain.finance` to an institution; `quality.wooden` can add `material → material.wood`; and `quality.red` can add `color → color.red`. Gradable qualities need not produce relation edges.

The effect changes the graph of the correct participant; it does not change that participant's identity. Modifier scope and source paths must remain recoverable. A red wooden table has distinct color and material edges on the table. The subject roles, pronouns and referents, number, definiteness, tense, aspect, modality, negation, and question wrapper remain in MeaningGraph. Surface language and inflection remain in language plugins.

## Matching, ambiguity, and unknown context

Matching first enforces valid IDs, relation direction, root and target types, and required edges. An explicit contradictory type or relation rejects that candidate. An unmentioned relation is unknown and does not count as contradiction. Typical edges can order the still-compatible alternatives, but cannot remove them. If more than one meaning remains compatible, return `ambiguous` with the alternatives. Do not choose the first ID or the highest typical weight as a substitute for evidence. Unsupported grammar remains `unsupported`; exceeded budgets return `resource_limit`.

`matchConceptGraphs({observed,candidates,ontology,maxCandidates})` is the bounded deterministic candidate matcher. `observed` is a canonical projection-shaped object (`root`, `nodes`, and `edges`) whose root names the most specific observed CORE type for the focus; each node and typed edge is validated against the same Ontology signatures and graph budgets. A candidate root must be a subtype of the observed root. A required candidate relation that is explicitly contradicted by a sibling target is rejected; missing or broader evidence remains unresolved. The default candidate limit is 16, and overflow returns `resource_limit` without truncation. Results retain every compatible candidate, expose matched relations, hard violations, unresolved edges, and a typical-only score. `status` is `matched` only for one hard-compatible candidate, `ambiguous` for multiple candidates, and `unsupported` when none remain. `conceptGraphSignature` sorts a validated observation into a stable JSON signature.

`Engine.resolveWord` accepts this graph only as the explicit `context.typedGraph` option. It runs after the existing form and lexical analysis, filters only hard-incompatible concept senses, and returns graph evidence with each remaining reading. An ambiguous result retains every compatible sense. The graph does not feed sentence parsing or translation until a later MeaningGraph projection supplies validated observations.

For example, an unqualified `bank` with no disambiguating context retains both financial-institution and riverbank senses and is ambiguous. Finance context can support the financial sense; a river-location context can support the riverbank sense. A weight alone cannot resolve the bare word.

## Normalization and resource limits

Graph definitions and projections have deterministic serialization. Sort projected edges by `from`, relation, target, constraint, and then weight; sort concept nodes by canonical ID. Sentence-level projections preserve distinct source paths when semantically distinct participants share a concept ID. Do not silently truncate. `Ontology.projectConceptGraph` expands the root, its parent chain, and typed definition targets once; it includes `typical` edges only when requested. Existing plain `relations` remain available through `relationTargets` and are not reweighted into definition graph edges.

| Budget | Limit |
| --- | ---: |
| Explicit edges per concept definition | 16 |
| Candidates per match | 16 |
| Nodes in one projected graph | 128 |
| Edges in one projected graph | 256 |
| Relation expansion depth | 8 |

The `parent` hierarchy must be acyclic. Other relation expansion uses a visited set and the depth and graph-size budgets; reaching a budget returns `resource_limit`. Projection defaults to required edges only and a maximum of 256 edges; callers may lower, but not raise, that edge limit. The schema enforces the per-definition edge count. Runtime code enforces all budgets and cross-record invariants.

For inventory reporting, a lemma is a nonempty canonical `lemma` normalized to NFC and locale casefolded independently for each language. Multiple senses or homographs count as one spelling. An entry without `lemma` is excluded unless an explicit, reviewed rule derives its canonical lemma from `forms`. Report `data_only`, `morphology_ready`, and `sentence_licensed` separately; a lexicon entry alone does not establish a supported sentence.

## Consequences

- CORE remains language-neutral and keeps all existing IDs and MeaningGraph semantics.
- Typed relation definitions are not translation pairs and do not bind PL directly to EN.
- Data additions require source and rights provenance, compatible targets, and independent review.
- New sentence expectations are written before execution and need human approval before they enter the required matrix. Existing 49 PL↔EN expectations remain protected.
- The bounded prototype continues to report ambiguity, unsupported constructions, known gaps, and resource limits explicitly.
