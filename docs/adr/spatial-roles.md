# ADR: typed destinations for movement

**Status:** accepted for the controlled movement slice.  
**Scope:** CORE ontology and PL/EN sentence adapters; no claim of general spatial semantics.

## Context

The existing `event.movement` frame represents intransitive movement with an `agent` only. Treating a destination as an incidental noun would lose its role in CORE and could silently change meaning during translation. Adding a required role directly to the existing event would also invalidate established sentences such as `The father goes.`

## Decision

- Keep `event.movement` as the intransitive event with only `agent`.
- Add `event.movement.to_destination`, a subtype that inherits `agent` and requires `destination`.
- Type `destination` as `place`. The `place` category contains institutional, geographical, and settlement categories; ordinary people and objects therefore cannot fill this role.
- Map an additional, explicitly destination-bearing sense of `go` and `iść` to the subtype. Parsing a bare intransitive clause still uses `event.movement` because the subtype frame requires a destination phrase.
- Realize the current controlled pair with English `to` and Polish `do` plus genitive: `goes to school` ↔ `idzie do szkoły`. English permits a bare noun only for this destination slot, preserving regular determiner rules elsewhere.
- Do not encode walking or another travel mode. English `go` and Polish `iść` are an approximate lexical mapping for this slice; CORE leaves manner unknown.
- Represent static location separately as `state.location`, with a subject, a spatial referent, and an explicit relation (`interior`, `surface`, or `point`). Do not encode `be in` as movement.
- Declare the supported prepositions in the language grammar: English `in/on/at` and Polish `w/na/przy`. Polish location phrases use the locative case; unknown prepositions are refused.

## Consequences

Existing intransitive CORE JSON and gold cases retain their shape. Destinations and static spatial relations are serialized and survive roundtrip independently of the language surface preposition. Unsupported or incomplete prepositional phrases are refused. Origins, routes, destination questions, and manner of travel remain separate future work.

## Evidence

`tests/spatial-roles.test.js` checks EN→PL and PL→EN destination preservation, CORE JSON roundtrip, the unchanged intransitive event, and rejection of incomplete or mistyped destinations. The existing movement gold continues to cover its declared intransitive scope.
