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

test('G1: CI is triggered on main, core branches, PRs and manual dispatch',()=>{
  const triggers=block('on','permissions');
  assert.match(triggers,/^  push:\s*$/m);
  assert.match(triggers,/^\s+- main\s*$/m);
  assert.match(triggers,/^\s+- ['"]core\/\*\*['"]\s*$/m);
  assert.match(triggers,/^  pull_request:\s*$/m);
  assert.match(triggers,/^  workflow_dispatch:\s*$/m);
});

test('G1: CI has read-only repository access and bounded concurrency',()=>{
  assert.match(block('permissions','concurrency'),/^  contents: read\s*$/m);
  assert.doesNotMatch(workflow,/^\s*contents:\s*write\s*$/m);
  assert.match(workflow,/^  cancel-in-progress: true$/m);
  assert.match(workflow,/^    timeout-minutes: (?:15|20)$/m);
});

test('G1: independent CI jobs cover release checks and isolate GUI offline parity',()=>{
  for(const name of ['engine-tests','lexical-audits','offline-parity','release-gate']){
    assert.match(workflow,new RegExp(`^  ${name}:$`,'m'));
  }
  for(const run of ['npm test','npm run check:lexicon','npm run check:morphology',
    'npm run check:gold','npm run check:a1-gold','npm run check:gold-family','npm run check:gold-father','npm run check:gold-movement','npm run check:gold-actions','npm run check:coverage','npm run check:standalone',
    'npm run check:release']) assert.ok(workflow.includes(`run: ${run}`),`Missing ${run}`);
  assert.doesNotMatch(workflow,/run:\s*npm run build:standalone/);
  assert.doesNotMatch(workflow,/run:\s*npm install/);
});

test('G1: each invoked npm command exists in the versioned package scripts',()=>{
  for(const name of ['test','check:lexicon','check:morphology','check:gold',
    'check:coverage','check:a1-gold','check:gold-family','check:gold-father','check:gold-movement','check:gold-actions','check:standalone','check:release']){
    assert.equal(typeof pkg.scripts?.[name],'string',`Missing npm script ${name}`);
  }
  assert.match(pkg.scripts['check:release'],/npm test/);
  assert.match(pkg.scripts['check:release'],/check:standalone/);
});

const probe=await readFile(new URL('../.github/workflows/actions-smoke.yml',import.meta.url),'utf8');
test('G1b: probe has only one runner startup job and no project execution',()=>{
  assert.match(probe,/^name: Actions Startup Probe$/m);
  assert.match(probe,/^  workflow_dispatch:$/m);
  assert.match(probe,/^    branches:$/m);
  assert.match(probe,/^      - main$/m);
  assert.match(probe,/^  contents: read$/m);
  assert.match(probe,/^  runner-start:$/m);
  assert.match(probe,/^    runs-on: ubuntu-latest$/m);
  assert.match(probe,/^    timeout-minutes: 5$/m);
  assert.match(probe,/^        run: echo /m);
  assert.doesNotMatch(probe,/actions\/checkout|actions\/setup-node|npm (?:run|test)|node --test/);
});

test('A1 Batch 3: separate family gold is enforced in lexical audits and release',()=>{
  const audits=workflow.match(/^  lexical-audits:\s*\n([\s\S]*?)(?=^  offline-parity:)/m);
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
