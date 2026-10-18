# Data package provenance

## Typed graph candidates

tools/importers/typed-graph.mjs accepts UTF-8 JSONL or headered TSV candidate records and writes a deterministic review report only under the root import-staging/typed-graph/ directory. The output file must be a new JSON filename; the importer refuses overwrites, path traversal and symlinked staging paths. Limits are 4 MB input, 2,000 rows, 16,000 characters per line, 16 graph edges per record and 24 MB output. The importer makes no network requests.

The importer rejects morphology, paradigm, binding and forms payloads. It does not infer inflection; language forms and provider bindings are reviewed and activated only in a later data wave.

Run it with node tools/importers/typed-graph.mjs --input FILE --format jsonl|tsv --out NEW_FILE.json. The TSV header order is sourceId, sourceVersion, author, license, permittedUse, reviewedAt, plLemma, enLemma, plPOS, enPOS, senseDefinition, senseId, proposedCoreId, proposedCoreType, parent, relations, confidenceNote, sourceLocation. The relations cell is a JSON array; use an empty cell for no parent or senseId. POS values are the singular canonical names in the candidate schema.

Each record is checked against schemas/typed-graph-candidate.schema.json, the current CORE IDs and their declared relation signatures. Lemmas are normalized to NFC and language-aware casefold for duplicate detection. A repeated lemma is retained only when distinct sense IDs, meanings and CORE targets explicitly describe separate senses; those candidates still require human review. Missing rights or uncertain alignment is marked review_needed. Invalid POS, duplicate/conflicting targets, orphan references, relation type mismatches, malformed encodings and unsafe paths receive stable rejection reason IDs.

Every emitted record is marked unverified; accepted_for_human_review means only that required metadata was supplied, not that meaning, licensing or permitted use was approved. The output is staging material and must not be copied into active CORE, language packages, morphology or required sentence cases without a separate reviewed wave change. Project-authored proposals should name the author and state the intended internal use. External sources require documented rights and permitted use before activation; the importer does not verify those claims.

`data/core/provenance.json` is the inventory for shared CORE JSON packages. It records each package's source, authorship, version, review date, license status, and permitted use. Language-specific source and rights information belongs in `languages/<code>/provenance.json`.

Review provenance whenever a package or inventory entry changes. Confirm that each active package has one matching record, all source and rights fields are present, and any unverified attribution is marked clearly. Record the files and review result in the issue or PR; there is no automated provenance gate in the CLI-only workflow.

`project-authored` describes origin; it does not grant an external license. The repository has no root license granting broader reuse. Do not copy protected vocabulary lists or dictionary definitions without permission. Preserve original source and license information for review-only imports under `import-staging/unimorph/`; a candidate with `verified: false` is not an active language package.

Language package provenance may include `originalPath` or `migratedFrom` values to describe historical source locations. Those fields document provenance and do not make the old locations active runtime paths.

The CORE feature registry retains `legacy-review-required` where historical attribution is incomplete. Review source and rights before redistribution. Add a provenance record for every new shared CORE package and every language package data source.
