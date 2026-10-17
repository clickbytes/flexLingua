# flexLingua — product roadmap

GitHub Issues and pull requests hold current priorities, dependencies, and task evidence. This document describes durable product direction, not task status.

## Product goal

Build a controlled translation system in which language-specific plugins analyze and realize text through one language-neutral CORE representation. The runtime and data contract use JavaScript ESM and JSON.

The current packages support bounded directions: Polish↔English, English↔Finnish, Turkish→English, and Italian→English. Arabic is morphology-only. Package status and capabilities describe implemented subsets; they do not imply complete language coverage.

## Product principles

- Preserve the difference between language-specific grammar and language-neutral meaning.
- Represent semantic roles, reference, quantity, polarity, tense, and other meaning explicitly.
- Preserve ambiguity and refuse unsupported or underspecified input instead of guessing.
- Keep each capability tied to a package provider and reviewable evidence.
- Preserve source and license records for lexical and morphology data.
- Describe bounded behavior honestly; do not claim general translation quality or CEFR completion from a small set of examples.

## Development direction

Grow the shared meaning model and language packages only when their contracts and manual evidence support the change. Prefer compositional rules over stored phrase pairs. Keep packages independent and declare unavailable directions or constructions explicitly.

The Node CLI is the current way to inspect package availability and review sentence behavior. Studio is outside the current CLI runtime and is documented as temporarily unavailable. Any future browser runtime requires its own explicit scope and plugin loading design.

## Quality direction

For each language change, record actual CLI commands, independently stated expected meaning, returned text or refusal, CORE roles, diagnostics, exit code, and the reviewed commit SHA. Review both wording and semantics. Manual examples document only the constructions they contain; they are not a representative benchmark or a general quality percentage.
