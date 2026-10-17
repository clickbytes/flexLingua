REPO: clickbytes/flexLingua
BASE_SHA: 7c0a9b12cea3181164b1b5e74c10da10cc87eddc
BATCH: A1-ENPL-07    ISSUE: https://github.com/clickbytes/flexLingua/issues/170    PR: PENDING
CHANGED: HANDOFF.MD; data/coverage/a1-enpl-constructions.json; tests/fixtures/gold-a1-enpl-basics.json; tools/a1-evidence-ledger-lib.mjs::EVIDENCE_SOURCES/buildA1ConstructionCoverage; tools/a1-evidence-ledger.mjs; tests/a1-evidence-ledger.test.js; tests/a1-enpl-basic-predication.test.js; data/provenance.json; docs/a1-scope.md; docs/coverage-a1.md; docs/a1-evidence-ledger.md
DONE: Registry maps 01-06 to real fixture/suite/case IDs; 08-12 remain planned with explicit gaps. CORE contract, direction, suite, fixture/case references and refusal reasons validate. Declared vs executed counts split by EN->PL/PL->EN and positive/refusal. A1-ENPL-01 static gold includes “This is a simple book.” Old 23-target inventory remains 16+7; drink is documented as a separate family. CEFR percentage remains null.
TEST: node --test tests/a1-evidence-ledger.test.js tests/a1-enpl-basic-predication.test.js — PASS, 9/9; npm run check:data-provenance — PASS, 26 packages; npm run check:a1-evidence — PASS; npm run check:core-gates — FAIL at 90e57ff0ad06a8c01a534db2d38eec8634fd27d7 because local Node 24 spec output does not match the existing dialogue-gold TAP parser (22 scenes reported failed; dialogue test file itself passes)
CI: NOT RUN; PR SHA not available
BLOCKERS: Local aggregate gate has a dialogue reporter mismatch; no merge without green required Actions on the exact PR SHA. Batch 12 remains gated on accepted semantic ADR
NEXT: A1-ENPL-08 / issue #171 — review third-person referent contract and the person-deixis ADR
