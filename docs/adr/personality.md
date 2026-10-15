# ADR: versioned personality realization profile

**Status:** Accepted for the currently supported adapter options  
**Profile version:** `1.0`

## Decision

Keep personality and presentation preferences in a separate, versioned JSON
profile. A profile is validated with `createPersonalityProfile()` before it is
used. It contains only rendering controls already supported by the engine:

- `pronounRealization`: `repeat` or `safe`;
- `outputVariant`: `preferred` or `first_alternative`.

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

The current grammars do not declare independent formality, warmth, or emotional
tone variants. Those controls are intentionally absent until the language
adapters can realize and test them. This avoids storing apparent settings that
cannot affect output.

## Validation and bounds

The profile schema is `schemas/personality.schema.json` (JSON Schema
2020-12). Profile IDs are lowercase ASCII identifiers up to 32 characters;
all realization settings are closed enums. The runtime validator enforces the
same exact keys, version, ID pattern, and option ranges before realization.

## Consequences

Callers can persist or switch presentation preferences independently of
conversation meaning. The default exactly preserves current output behavior.
Future style controls require a new schema/runtime contract and adapter-backed
tests; no personality data belongs in event semantics.
