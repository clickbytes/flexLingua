# Data package provenance

`data/provenance.json` is the canonical inventory for checked-in JSON data packages. It records the package version, source, authorship, license status, review date and permitted use without adding non-runtime metadata to the JSON consumed by the engine.

Run `npm run check:data-provenance` to verify that every JSON package under `data/` has exactly one inventory entry, the recorded version matches the package, all provenance fields are present, and packages without verified attribution carry a migration note. The check runs in lexical CI and `check:release`.

The four A1/core packages `data/concepts.json`, `data/pl.json`, `data/en.json` and `data/coverage/a1-targets.json` are recorded as project-authored. The checked-in A1 pilot, G2 and VAL-02 H1 corpora are also recorded as manually specified project material, not copied from Oxford or generated from engine output. The target checklist is a deliberately small project subset, not an Oxford list or CEFR standard. Existing package documentation describes the lexical entries as independently curated, rather than copied from third-party dictionaries.

VAL-02 H1 is recorded as project-authored with the implementation owner named and the unavailable independent author separation disclosed. It is a finite internal regression sample, not an independent CEFR benchmark; its expected text is not generated from parser output.

The repository has no root `LICENSE` file. `project-authored` describes origin; it does not grant an external license. The inventory therefore limits reuse of these packages to this project unless a rights holder grants further permission.

UniMorph imports are review-only artifacts under `import-staging/unimorph/`,
outside active `data/` packages. Each candidate retains the supplied source and
license with `verified: false`; reviewers must confirm those rights and the
language mapping profile before moving any form into a production package.

Ten older packages do not record per-package or per-entry attribution and are marked `legacy-review-required`. Their conservative use terms and migration notes are explicit in the inventory. Review sources and rights before adding data to those packages or redistributing their contents. Any new JSON data package must be added to the inventory before the provenance gate passes.

This audit does not import external datasets or reproduce protected Oxford vocabulary lists or definitions.

## ADV-01 abstract process senses

`data/coverage/c1-targets.json` records 30 separately identified abstract process senses and their English and Polish formal lemmas. The mappings and register labels were authored for this project; no external dictionary definitions or vocabulary lists were copied. Each formal lemma maps to one distinct CORE concept. Two senses also have controlled plain aliases: `verification`/`check` and `weryfikacja`/`kontrola` for a procedural check, and `recommendation`/`tip` and `rekomendacja`/`porada` for a practical suggestion. These aliases do not assert that the words are interchangeable in every context.

The matrix is a finite research subset. It has no CEFR denominator or independent language review and cannot establish C1 coverage. `lexicalRegister` accepts `neutral`, `formal` and `plain` for event realization. When a requested variant is unavailable, the preferred lemma is retained with a warning. The option changes surface nouns only; it does not change their CORE concept. Other construction types still use their existing realization rules. Polish may not preserve English definiteness or aspect in a roundtrip; register choice preserves the mapped process sense within those established language limits.

ADV-04 adds `data/coverage/c2-targets.json` and the pinned `tests/fixtures/gold-advanced.json`: 100 explicit cases for each of C1 and C2, with 25 per declared category. The case oracles were specified from project-authored templates and checked against the engine, without independent per-case language review. The C1 and C2 results are reported separately by category and translation direction through `tools/advanced-gold-lib.mjs`; they do not enter the A1 evidence ledger. The samples have no representative CEFR denominator and do not certify either level.
