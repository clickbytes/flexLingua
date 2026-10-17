# flexLingua - product roadmap

GitHub Issues and pull requests hold current priorities, dependencies, and task evidence. This document describes durable product direction, not task status.

## Product goal

Build a controlled translation system in which language-specific plugins analyze and realize text through one language-neutral CORE representation. The runtime and data contract use JavaScript ESM and JSON.

The current packages support bounded directions: Polish<->English, English<->Finnish, Turkish->English, and Italian->English. Arabic is morphology-only. Package status and capabilities describe implemented subsets; they do not imply complete language coverage.

## Product surfaces

The local application is a terminal UI with exactly three tabs: Translate, Chat, and Forms. It uses one Engine and PluginRegistry per process through the shared application runtime. The Node translation CLI remains a separate, non-interactive entry point and can be used without starting the TUI. Neither surface requires an HTTP server or browser build.

The CLI is the acceptance path for sentence behavior. The TUI provides interactive access to the same bounded services and must show unsupported results and diagnostics explicitly.

Chat state exists only in the process memory. Forms shows results supplied by a language's morphology provider; it does not infer new forms or capabilities.

## Product principles

- Preserve the difference between language-specific grammar and language-neutral meaning.
- Represent semantic roles, reference, quantity, polarity, tense, and other meaning explicitly.
- Preserve ambiguity and refuse unsupported or underspecified input instead of guessing.
- Keep each capability tied to a package provider and reviewable evidence.
- Preserve source and license records for lexical and morphology data.
- Describe bounded behavior honestly; do not claim general translation quality or CEFR completion from a small set of examples.

## Development direction

Grow the shared meaning model and language packages only when their contracts and manual evidence support the change. Prefer compositional rules over stored phrase pairs. Keep packages independent and declare unavailable directions or constructions explicitly.

## Quality direction

For each language change, record actual CLI commands, independently stated expected meaning, returned text or refusal, CORE roles, diagnostics, exit code, and the reviewed commit SHA. Review both wording and semantics. Manually verify terminal behavior in supported environments and record any scenario that could not be run. Manual examples document only the constructions they contain; they are not a representative benchmark or a general quality percentage.

The canonical sentence test matrix in `tests/` is the enforced quality gate for sentence behavior: `npm test` locally and the required `translation-matrix` GitHub Actions check score translation, controlled refusal, and explicit ambiguity separately, and report known gaps and infrastructure errors without ever crediting them as passes. Growing the matrix into more A1 coverage and more directions is the planned product direction; it always goes through independently authored, human-approved expectations before any implementation lands.
