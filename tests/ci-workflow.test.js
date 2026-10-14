import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/core-engine.yml',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));

function block(start,end){
  const match=workflow.match(new RegExp(`^${start}:\\s*\\n([\\s\\S]*?)(?=^${end}:)`, 'm'));
  assert.ok(match,`Missing or malformed ${start} block`);
  return match[1];
}

test('G1: CI is triggered on main, PRs and manual dispatch',()=>{
  const triggers=block('on','permissions');
  assert.match(triggers,/^  push:\s*\n    branches:\s*\n      - main\s*$/m);
  assert.doesNotMatch(triggers,/core\/\*\*/);
  assert.match(triggers,/^  pull_request:\s*$/m);
  assert.match(triggers,/^    branches:\s*\n      - main\s*$/m);
  assert.match(triggers,/^  workflow_dispatch:\s*$/m);
});

test('G1: CI has read-only repository access and bounded concurrency',()=>{
  assert.match(block('permissions','concurrency'),/^  contents: read\s*$/m);
  assert.doesNotMatch(workflow,/^\s*contents:\s*write\s*$/m);
  assert.match(workflow,/^  cancel-in-progress: true$/m);
  assert.match(workflow,/^    timeout-minutes: (?:15|20)$/m);
});

test('G1: CI runs Node and lexical checks behind a lightweight aggregate gate',()=>{
  for(const name of ['engine-tests','lexical-audits','release-gate']){
    assert.match(workflow,new RegExp(`^  ${name}:$`,'m'));
  }
  for(const run of ['npm test','npm run check:lexicon','npm run check:morphology',
    'npm run check:gold','npm run check:a1-gold','npm run check:gold-family','npm run check:gold-father','npm run check:gold-movement','npm run check:gold-actions','npm run check:gold-person','npm run check:a1-evidence','npm run check:coverage','npm run check:data-provenance'
    ]) assert.ok(workflow.includes(`run: ${run}`),`Missing ${run}`);
  assert.doesNotMatch(workflow,/run:\s*npm run check:release/);
  assert.doesNotMatch(workflow,/run:\s*npm run build:standalone/);
  assert.doesNotMatch(workflow,/standalone|offline-parity/);
  assert.doesNotMatch(workflow,/run:\s*npm install/);
});

test('REL-01: aggregate gate preserves the CI check while avoiding duplicate execution',()=>{
  assert.match(workflow,/^  engine-tests:[\s\S]*?^  lexical-audits:/m);
  assert.match(workflow,/^  lexical-audits:[\s\S]*?^  release-gate:/m);
  assert.match(workflow,/^  engine-tests:[\s\S]*?run: npm test/m);
  assert.match(workflow,/^  lexical-audits:[\s\S]*?run: npm run check:a1-evidence/m);
  const gate=workflow.match(/^  release-gate:[\s\S]*$/m)?.[0];
  assert.ok(gate,'Missing release-gate job');
  assert.match(gate,/^    if: \$\{\{ always\(\) \}\}$/m);
  assert.match(gate,/^    needs: \[engine-tests, lexical-audits\]$/m);
  assert.match(gate,/needs\.engine-tests\.result != 'success'/);
  assert.match(gate,/needs\.lexical-audits\.result != 'success'/);
  assert.match(gate,/run: exit 1/);
  assert.match(gate,/run: echo "All release checks passed\."/);
  assert.doesNotMatch(gate,/actions\/checkout|actions\/setup-node|npm run check:release/);
});

test('G1: each invoked npm command exists in the versioned package scripts',()=>{
  for(const name of ['test','check:lexicon','check:morphology','check:gold',
    'check:coverage','check:a1-gold','check:gold-family','check:gold-father','check:gold-movement','check:gold-actions','check:gold-person','check:a1-evidence','check:data-provenance','check:release']){
    assert.equal(typeof pkg.scripts?.[name],'string',`Missing npm script ${name}`);
  }
  assert.match(pkg.scripts['check:release'],/npm test/);
  assert.doesNotMatch(pkg.scripts['check:release'],/standalone/);
  assert.equal(pkg.scripts['build:standalone'],undefined);
  assert.equal(pkg.scripts['check:standalone'],undefined);
  assert.match(pkg.scripts['check:release'],/check:data-provenance/);
});

test('A1 Batch 3: separate family gold is enforced in lexical audits and release',()=>{
  const audits=workflow.match(/^  lexical-audits:\s*\n([\s\S]*?)(?=^  release-gate:)/m);
  assert.ok(audits,'Missing lexical-audits job');
  assert.match(audits[1],/^      - run: npm run check:gold-family$/m);
  assert.match(pkg.scripts['check:release'],/npm run check:gold-family/);
  assert.equal(pkg.scripts['check:gold-family'],'node --test tests/family-actions-a1.test.js');
});

test('A1 Batch 4: father gold required by CI and release',()=>{
 assert.match(workflow,/^      - run: npm run check:gold-father$/m);
 assert.match(pkg.scripts['check:release'],/npm run check:gold-father/);
 assert.equal(pkg.scripts['check:gold-father'],'node --test tests/father-a1.test.js');
});

test('A1 Batch 5: movement gold required in lexical audit and release gate',()=>{
 assert.match(workflow,/^      - run: npm run check:gold-movement$/m);
 assert.equal(pkg.scripts['check:gold-movement'],'node --test tests/movement-a1.test.js');
 assert.match(pkg.scripts['check:release'],/npm run check:gold-movement/);
});

test('A1 Batch 6: daily actions gold is mandatory for lexical audits and release',()=>{
 assert.match(workflow,/^      - run: npm run check:gold-actions$/m);
 assert.equal(pkg.scripts['check:gold-actions'],
   'node --test tests/daily-actions-a1.test.js tests/a1-crossbatch-composition.test.js');
 assert.match(pkg.scripts['check:release'],/npm run check:gold-actions/);
});

test('A1 Batch 7: comprehensive evidence audit is mandatory in lexical CI and release',()=>{
 assert.match(workflow,/^      - run: npm run check:a1-evidence$/m);
 assert.equal(pkg.scripts['report:a1-evidence'],'node tools/a1-evidence-ledger.mjs --catalog-only');
 assert.equal(pkg.scripts['check:a1-evidence'],'node tools/a1-evidence-ledger.mjs');
 assert.match(pkg.scripts['check:release'],/npm run check:a1-evidence/);
});

test('PERS-06: person gold is a mandatory independent CI and release gate',()=>{
 assert.match(workflow,/^      - run: npm run check:gold-person$/m);
 assert.equal(pkg.scripts['check:gold-person'],'node --test tests/a1-person-gold.test.js');
 assert.match(pkg.scripts['check:release'],/npm run check:gold-person/);
});
