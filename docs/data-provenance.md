# Data package provenance

`data/core/provenance.json` is the inventory for shared CORE JSON packages. It records each package's source, authorship, version, review date, license status, and permitted use. Language-specific source and rights information belongs in `languages/<code>/provenance.json`.

Review provenance whenever a package or inventory entry changes. Confirm that each active package has one matching record, all source and rights fields are present, and any unverified attribution is marked clearly. Record the files and review result in the issue or PR; there is no automated provenance gate in the CLI-only workflow.

`project-authored` describes origin; it does not grant an external license. The repository has no root license granting broader reuse. Do not copy protected vocabulary lists or dictionary definitions without permission. Preserve original source and license information for review-only imports under `import-staging/unimorph/`; a candidate with `verified: false` is not an active language package.

Language package provenance may include `originalPath` or `migratedFrom` values to describe historical source locations. Those fields document provenance and do not make the old locations active runtime paths.

The CORE feature registry retains `legacy-review-required` where historical attribution is incomplete. Review source and rights before redistribution. Add a provenance record for every new shared CORE package and every language package data source.
