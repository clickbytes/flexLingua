# Data package provenance

`data/provenance.json` is the canonical inventory for checked-in JSON data packages. It records the package version, source, authorship, license status, review date and permitted use without adding non-runtime metadata to the JSON consumed by the engine.

Run `npm run check:data-provenance` to verify that every JSON package under `data/` has exactly one inventory entry, the recorded version matches the package, all provenance fields are present, and packages without verified attribution carry a migration note. The check runs in lexical CI and `check:release`.

The four A1/core packages `data/concepts.json`, `data/pl.json`, `data/en.json` and `data/coverage/a1-targets.json` are recorded as project-authored. The checked-in A1 pilot, G2 and VAL-02 H1 corpora are also recorded as manually specified project material, not copied from Oxford or generated from engine output. The target checklist is a deliberately small project subset, not an Oxford list or CEFR standard. Existing package documentation describes the lexical entries as independently curated, rather than copied from third-party dictionaries.

VAL-02 H1 is recorded as project-authored with the implementation owner named and the unavailable independent author separation disclosed. It is a finite internal regression sample, not an independent CEFR benchmark; its expected text is not generated from parser output.

The repository has no root `LICENSE` file. `project-authored` describes origin; it does not grant an external license. The inventory therefore limits reuse of these packages to this project unless a rights holder grants further permission.

Ten older packages do not record per-package or per-entry attribution and are marked `legacy-review-required`. Their conservative use terms and migration notes are explicit in the inventory. Review sources and rights before adding data to those packages or redistributing their contents. Any new JSON data package must be added to the inventory before the provenance gate passes.

This audit does not import external datasets or reproduce protected Oxford vocabulary lists or definitions.
