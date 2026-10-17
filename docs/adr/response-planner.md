# ADR: deterministic CORE response planner

**Status:** Accepted for the DIAL-03 rule subset  
**Capability:** `responsePlannerVersion: "1.0"`

## Decision

Add a local, deterministic planner that accepts a validated CORE question and
bounded validated facts, then returns a replayable response plan. The plan
contains the source question, typed dialogue act, optional CORE proposition for
realization, ordered evidence references, and an explicit outcome/reason.
`Engine.respond()` realizes the proposition through the existing target
language adapters. The planner has no network or language-model dependency and
does not contain PL/EN sentence pairs.

## Supported rules

- A yes/no question is confirmed only by an explicit semantically matching
  fact. For simple event/state polarity and wide negation, an explicit opposite
  fact can produce a typed negative answer.
- A WH question is answered only when an asserted event matches the complete
  question proposition after the declared role gap is filled. The returned
  participant remains a typed CORE referent.
- Duplicate support is retained in evidence. Contradictory yes/no evidence or
  multiple distinct WH answers produces `refuse` with reason `ambiguous`.
- Participant comparison is structural and uses the optional per-role
  `referenceContext`. Equal grounded IDs permit only the declared mention
  normalization: `features.definiteness` may differ. Different IDs do not match
  for specific participants. Two indefinite mentions retain existential
  proposition matching even when their local mention IDs differ; WH candidate
  identity still distinguishes grounded IDs.
- Unresolved anaphoric and deictic participants receive input-scoped unresolved
  identities, so a copied pronoun cannot ground a fact by matching its JSON.
  Without reference IDs, ordinary participants retain the legacy exact-mention
  comparison; definiteness is not normalized and no identity is inferred.
- Missing evidence produces `refuse` with reason `insufficient_context`.
  Unsupported question shapes produce `refuse` with reason `unsupported`.
- A supplied, validated clarification question produces a `clarify` act linked
  to the original question. Otherwise an unknown plan has no realization text.

Facts may be a single clause, a bounded array of clauses or `assert` acts, or a
validated discourse document. Other dialogue acts and unvalidated text are not
facts. The planner does not infer that something is false because it is absent,
derive facts from language strings, resolve contradictory sources, or apply
general logic, temporal reasoning, quantifier reasoning, or world knowledge.

## Session integration

`ConversationContext` plans against its latest pending question and uses only
explicit prior `assert` turns unless the caller supplies facts. It appends the
typed reply only after planning and target realization succeed. Clarifications
preserve the parent question according to `DialogueContext` turn-order rules.

## Replay and bounds

The same validated question and ordered facts produce the same JSON plan. The
plan records fact and discourse-event indices so callers can audit its support.
At most 32 facts are accepted; discourse documents retain their existing event
limit. All input and generated CORE documents pass the regular ontology and
feature validators.

## Consequences

The current rule subset deliberately prefers an explicit unknown over a guess.
It answers exact controlled semantics and leaves richer inference, more WH
shapes, natural-language response-act realization, and confidence scoring for
separate versioned work.
