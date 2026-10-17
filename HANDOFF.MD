REPO: clickbytes/flexLingua
BASE_SHA: 8d1880742756b7c948b13de18f3b961e5287ea46
BATCH: A1-ENPL-10    ISSUE: https://github.com/clickbytes/flexLingua/issues/173    PR: pending
CHANGED: data/coverage/a1-enpl-constructions.json::A1-ENPL-10; data/grammar/en.json::states.frames.classification.supportedTenses; data/grammar/pl.json::states.frames.classification.supportedTenses; data/provenance.json::#173; docs/a1-scope.md; docs/coverage-a1.md; docs/a1-evidence-ledger.md; js/core/grammar.js::validateGrammar/parseStateCandidates/realizeState/analyzeAuxiliaryStateQuestion/realizeStateQuestion; tests/a1-enpl-basic-predication.test.js; tests/a1-evidence-ledger.test.js; tests/fixtures/gold-a1-enpl-basics.json; tools/a1-evidence-ledger-lib.mjs::explicitConcepts/coreDescriptor/EVIDENCE_SOURCES
DONE: Present classification now supports negative statements and yes/no questions in EN↔PL, preserving classification CORE with separate static gold for book and modified book/cat categories. Classification past and WH are explicit refusals. Registry links 8 positive bilingual cases and 2 refusals; unchanged G2/H1 and frozen 23-target matrix.
TEST: `node --test tests/a1-enpl-basic-predication.test.js` — PASS, 3/3; `node --test tests/a1-evidence-ledger.test.js` — PASS, 7/7; `npm run check:lexicon` — PASS (EN 225 lexemes/233 senses, PL 228/233, IT 8/8); `npm run check:data-provenance` — PASS (26 packages). Full `npm run check:core-gates` NOT RUN; run on committed clean tree.
CI: NOT RUN for Batch 10; PR not opened.
BLOCKERS: NONE.
NEXT: Verify repo identity, commit Batch 10, run `npm run check:core-gates` on the clean commit, then open PR and require green Actions on exact PR and main SHAs.
