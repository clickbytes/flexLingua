# flexLingua

flexLingua is a controlled Polish–English translation prototype built around a shared, language-neutral meaning representation.

```text
Polish  →  CORE / INTER  →  English
English →  CORE / INTER →  Polish
```

The project separates meaning from language-specific vocabulary, morphology, and grammar. It does not claim to translate arbitrary free text or to certify CEFR proficiency.

## Current work

GitHub is the work tracker:

- [Issues](https://github.com/clickbytes/flexLingua/issues) hold task scope, acceptance criteria, dependencies, and status.
- Pull requests hold the proposed change and review.
- GitHub Actions holds validation results for the exact commit.
- The source tree, tests, and technical documents describe the product that exists.

The README and roadmap describe the project; they are not task logs.

## Run locally

On Windows, start `start.bat` from the repository root. It starts a loopback-only HTTP server and opens the Studio.

With Node.js, run:

```sh
npm run dev
```

Then open http://127.0.0.1:8000/. A local server is required; direct `file://` use is unsupported.

## Validate changes

```sh
npm test                 # szybki cykl podczas pracy
npm run check:release   # pełny lokalny gate, zawiera npm test
```

`check:release` includes `npm test` and the configured data, morphology, gold, coverage, and provenance checks. Run that command once before finishing a change. CI runs the Node suite and lexical audits in parallel, then reports one aggregate release status.

## Project structure

- `js/core/` — language-independent engine and shared APIs.
- `data/core/concepts.json` — shared semantic concepts used by language packages.
- `data/pl.json`, `data/en.json` — Polish and English lexical data.
- `data/grammar/`, `data/morphology/` — language-specific rules and inflection.
- `tests/` — regression tests and independently authored gold examples.
- `docs/` — API, grammar, semantic, data, and quality contracts.

Start with the [documentation index](docs/README.md), [product roadmap](ROADMAP.md), or [development workflow](docs/development-workflow.md).

## Limits

The engine only accepts constructions declared by its current data and grammar. Unsupported or ambiguous input should produce an explicit diagnostic instead of a guessed translation. Gold tests verify their stated examples and do not measure complete language proficiency.

