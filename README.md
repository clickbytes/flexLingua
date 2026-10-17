# flexLingua

flexLingua is a bounded, rule-based translation prototype. Each language is a JavaScript ESM plugin with JSON data, and translations pass through a shared, language-neutral CORE meaning representation.

The supported packages cover controlled subsets: PL<->EN, EN<->FI, TR->EN, and IT->EN. Arabic currently provides morphology only. The project does not claim to translate arbitrary free text or to certify CEFR proficiency. Unsupported input and unavailable directions produce explicit diagnostics.

## Run the terminal app

Use Node.js 22.12.0 or newer. Install the locked dependencies once with `npm ci`, then start the interactive terminal UI:

```sh
npm run tui
```

On Windows, `start.bat` starts the same terminal app from the repository directory. The app has exactly three tabs: Translate, Chat, and Forms. See the [terminal UI guide](docs/tui.md) for keyboard controls, supported behavior, and terminal sizing.

## Run the CLI

The translation CLI remains a separate command and does not require an interactive terminal or a running TUI:

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
```

See [CLI usage](docs/cli.md) for arguments, JSON output, diagnostics, and exit codes.

## Project structure

- `languages/<code>/` - package entry point, manifest, language graph, and optional language data.
- `js/plugins/` - plugin contract, validation, registry, loader, and graph support.
- `js/core/` and `data/core/` - shared engine and language-neutral meaning model.
- `js/app/` - shared runtime and translation, chat, and forms services.
- `js/tui/` and `tools/tui.mjs` - terminal shell and entry point.
- `tools/translate.mjs` - sentence translation and package discovery CLI.
- `examples/cli-sentences.md` - manually reviewed commands and expected meaning or refusal.
- `docs/` - current architecture, plugin, TUI, CLI, provenance, and decision documents.

## Review and limits

Review language behavior by running real sentences through the CLI and comparing the surface text, CORE meaning, and diagnostics. Record the exact commands, independently stated expected meaning, actual result, refusal reasons, exit codes, and commit SHA in the issue or PR. Manually check TUI behavior in an interactive terminal; do not report scenarios that were not run. No automated suite or GitHub Actions gate is used for acceptance.

Start with the [development workflow](docs/development-workflow.md), [documentation index](docs/README.md), or [product roadmap](ROADMAP.md).
