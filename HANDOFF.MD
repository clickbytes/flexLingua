REPO: clickbytes/flexLingua
BASE_SHA: 75fd3e31da1bb69ad3c464c02a069b52a5c579fa
BATCH: A1-ENPL-09    ISSUE: https://github.com/clickbytes/flexLingua/issues/172    PR: pending
CHANGED: data/grammar/en.json::verb.rules/progressive; data/coverage/a1-enpl-constructions.json::A1-ENPL-06/A1-ENPL-09; data/provenance.json::#172; docs/a1-scope.md; docs/coverage-a1.md; docs/a1-evidence-ledger.md; js/core/grammar.js::analyzeAuxiliaryQuestion/analyzeQuestionCandidates/renderEvent/realizeQuestion; tests/a1-present-progressive.test.js; tests/fixtures/gold-a1-present-progressive.json; tools/a1-evidence-ledger-lib.mjs::progressive schema versions/digest
DONE: Added six EN progressive negatives and six yes/no questions with independent static CORE and Polish targets for each configured verb. Added six PL negative-present reversals to ensure CORE does not invent English progressive; English rendering chooses simple present where CORE cannot distinguish it. Registry maps A1-ENPL-06 and 09 to executed gold cases; G2/H1 and frozen 23-target matrix are unchanged. Batch 08 merged at 75fd3e31da1bb69ad3c464c02a069b52a5c579fa; PR Actions PASS https://github.com/clickbytes/flexLingua/actions/runs/39007864656 and main Actions PASS https://github.com/clickbytes/flexLingua/actions/runs/39008133235.
TEST: `node --test tests/a1-present-progressive.test.js` — PASS, 4/4; `npm run check:a1-evidence -- --output <temp>` — PASS, 16/16 suites; `npm run check:data-provenance` — PASS, 26 packages.
CI: NOT RUN for Batch 09 yet; waiting for PR SHA.
BLOCKERS: None for Batch 09. Batch 12 remains gated by accepted semantic ADR.
NEXT: Review clean diff and release checks, then prepare PR; after merge start A1-ENPL-10 / issue #173.
