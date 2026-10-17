# Data package provenance

`data/core/provenance.json` is the canonical inventory for shared CORE JSON packages only. It records each package version, source, authorship, license status, review date and permitted use without adding non-runtime metadata to the JSON consumed by the engine. Language plugin sources and rights are recorded in the corresponding `languages/<code>/provenance.json`.

Run `npm run check:data-provenance` to verify that every JSON package under `data/core/` has exactly one inventory entry, the recorded version matches the package, all provenance fields are present, and packages without verified attribution carry a migration note.

The CORE concept inventory is project-authored, including its reviewed LEX-01 batches. The former whole-data inventory also recorded the A1 pilot, G2 and VAL-02 H1 corpora as manually specified project material, not copied from Oxford or generated from engine output. The A1 target checklist is a deliberately small project subset, not an Oxford list or CEFR standard; its current origin and use limits are stated in [A1 scope](a1-scope.md). Existing language package provenance describes lexical entries as independently curated, rather than copied from third-party dictionaries.

VAL-02 H1 is recorded as project-authored with the implementation owner named and the unavailable independent author separation disclosed. It is a finite internal regression sample, not an independent CEFR benchmark; its expected text is not generated from parser output.

The repository has no root `LICENSE` file. `project-authored` describes origin; it does not grant an external license. The inventory therefore limits reuse of these packages to this project unless a rights holder grants further permission.

UniMorph imports are review-only artifacts under `import-staging/unimorph/`,
outside active `data/` packages. Each candidate retains the supplied source and
license with `verified: false`; reviewers must confirm those rights and the
language mapping profile before moving any form into a production package.

The CORE feature registry retains its `legacy-review-required` status because its historical attribution remains incomplete. Review its sources and rights before redistribution. Any new shared CORE JSON package must be added to the CORE inventory before the provenance check passes.

This audit does not import external datasets or reproduce protected Oxford vocabulary lists or definitions.

## ADV-01 abstract process senses

`data/coverage/c1-targets.json` records 30 separately identified abstract process senses and their English and Polish formal lemmas. The mappings and register labels were authored for this project; no external dictionary definitions or vocabulary lists were copied. Each formal lemma maps to one distinct CORE concept. Two senses also have controlled plain aliases: `verification`/`check` and `weryfikacja`/`kontrola` for a procedural check, and `recommendation`/`tip` and `rekomendacja`/`porada` for a practical suggestion. These aliases do not assert that the words are interchangeable in every context.

The matrix is a finite research subset. It has no CEFR denominator or independent language review and cannot establish C1 coverage. `lexicalRegister` accepts `neutral`, `formal` and `plain` for event realization. When a requested variant is unavailable, the preferred lemma is retained with a warning. The option changes surface nouns only; it does not change their CORE concept. Other construction types still use their existing realization rules. Polish may not preserve English definiteness or aspect in a roundtrip; register choice preserves the mapped process sense within those established language limits.

ADV-04 adds `data/coverage/c2-targets.json` and the pinned `tests/fixtures/gold-advanced.json`: 100 explicit cases for each of C1 and C2, with 25 per declared category. The case oracles were specified from project-authored templates and checked against the engine, without independent per-case language review. The C1 and C2 results are reported separately by category and translation direction through `tools/advanced-gold-lib.mjs`; they do not enter the A1 evidence ledger. The samples have no representative CEFR denominator and do not certify either level.
