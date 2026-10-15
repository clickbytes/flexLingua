# ADR: versioned personality realization profile

**Status:** Accepted for the currently supported adapter options  
**Profile version:** `1.1`

## Decision

Keep personality and presentation preferences in a separate, versioned JSON
profile. A profile is validated with `createPersonalityProfile()` before it is
used. It contains only rendering controls already supported by the engine:

- `pronounRealization`: `repeat` or `safe`;
- `outputVariant`: `preferred` or `first_alternative`.
- `replyStyles`: independent `pl` and `en` reply styles, each `standard` or `emphatic`.

The shipped default is `data/personality/default.json`. The runtime exports a
matching immutable `DEFAULT_PERSONALITY_PROFILE`; no filesystem or network
lookup is required to use it.

## Semantic boundary

Profiles are never serialized into CORE or dialogue acts. Applying a profile
may choose a safe target pronoun or an existing grammatical alternative, but it
does not edit concept, roles, polarity, tense, aspect, referents, or question
gaps. If a requested alternate wording is unavailable, the preferred wording
is retained with a warning. Unsupported personality controls and unknown keys
are rejected instead of being silently ignored.

The PL and EN grammars declare the two reply punctuation styles. The style is
applied only to realized responses, after CORE planning, so the response act and
proposition remain identical. `emphatic` changes the final period to an
exclamation mark. Questions and unsupported style names keep standard wording
with a warning. The profiles do not claim independent formality or warmth.

## Validation and bounds

The profile schema is `schemas/personality.schema.json` (JSON Schema
2020-12). Profile IDs are lowercase ASCII identifiers up to 32 characters.
The runtime accepts legacy `1.0` profiles and fills their missing reply styles
with `standard`. Unsupported reply styles are syntactically valid but generate
a warning and use standard wording; other profile options remain closed enums.

## Consequences

Callers can persist or switch presentation preferences independently of
conversation meaning. The default exactly preserves current output behavior.
Future style controls require a new schema/runtime contract and adapter-backed
tests; no personality data belongs in event semantics.
