# flexLingua

flexLingua is a bounded, rule-based translation prototype. Each language is a JavaScript ESM plugin with JSON data, and translations pass through a shared, language-neutral CORE meaning representation.

The supported packages cover controlled subsets: PL↔EN, EN↔FI, TR→EN, and IT→EN. Arabic currently provides morphology only. The project does not claim to translate arbitrary free text or to certify CEFR proficiency. Unsupported input and unavailable directions must produce explicit diagnostics.

## Run the CLI

Use Node.js from the repository root:

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
```

The CLI does not require a server or GUI. See [CLI usage](docs/cli.md) for arguments, JSON output, diagnostics, and exit codes. The Studio browser assets remain in the repository, but Studio is temporarily unavailable in the CLI-only runtime; see [GUI status](docs/gui.md).

## Project structure

- `languages/<code>/` — package entry point, manifest, language graph, and optional language data.
- `js/plugins/` — plugin contract, validation, registry, loader, and graph support.
- `js/core/` and `data/core/` — shared engine and language-neutral meaning model.
- `tools/translate.mjs` — sentence translation and package discovery CLI.
- `examples/cli-sentences.md` — manually reviewed commands and expected meaning or refusal.
- `docs/` — current architecture, plugin, CLI, provenance, and decision documents.

## Review and limits

Review language behavior by running real sentences through the CLI and comparing the surface text, CORE meaning, and diagnostics. Record the exact commands, expected and actual results, refusal reasons, exit codes, and commit SHA in the issue or PR. No automated suite or GitHub Actions gate is used for acceptance.

Start with the [development workflow](docs/development-workflow.md), [documentation index](docs/README.md), or [product roadmap](ROADMAP.md).
