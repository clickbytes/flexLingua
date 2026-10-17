# flexLingua

flexLingua is a bounded, rule-based translation prototype. Each language is a JavaScript ESM plugin with JSON data, and translations pass through a shared, language-neutral CORE meaning representation.

The supported packages cover controlled subsets: PL<->EN, EN<->FI, TR->EN, and IT->EN. Arabic currently provides morphology only. The project does not claim to translate arbitrary free text or to certify CEFR proficiency. Unsupported input and unavailable directions produce explicit diagnostics.

## Run the terminal app

Use Node.js 22.12.0 or newer. Install the locked dependencies once with `npm ci`, then start the interactive terminal UI:

```sh
npm run tui
```

On Windows, `start.bat` starts the same terminal app from the repository directory. The app has exactly three modes: Translate, Chat, and Forms. See the [terminal UI guide](docs/tui.md) for startup; use `/help` in the app for current controls. The redesign specification is tracked in [issue #324](https://github.com/clickbytes/flexLingua/issues/324).

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
- `tests/` - the canonical A1 sentence test matrix: approved cases, schemas, planning catalog, known gaps, and the single runner behind `npm test`.
- `examples/cli-sentences.md` - manual spot-check commands beyond the approved matrix cases.
- `docs/` - current architecture, plugin, TUI, CLI, provenance, and decision documents.

## Language verification

The canonical sentence test matrix in `tests/` is the single source of truth for approved sentence expectations. `npm test` runs the full gate (validation, matrix execution on the production service, coverage accounting, CLI smoke, and reports), and the required `translation-matrix` GitHub Actions check enforces the same matrix on pull requests and pushes to `main`. Approved expectations cover exact text, CORE meaning, roles, features, alternates, information loss, diagnostics, known gaps, and explicit ambiguity; refusals are scored separately from successes and known gaps never count as a pass. See [the matrix README](tests/README.md).

## Review and limits

Review language behavior beyond the approved cases by running real sentences through the CLI and comparing the surface text, CORE meaning, and diagnostics. Record the exact commands, independently stated expected meaning, actual result, refusal reasons, exit codes, and commit SHA in the issue or PR. Manually check TUI behavior in an interactive terminal; do not report scenarios that were not run. Other automated suites are not acceptance gates.

Start with the [development workflow](docs/development-workflow.md), [documentation index](docs/README.md), or [product roadmap](ROADMAP.md).
