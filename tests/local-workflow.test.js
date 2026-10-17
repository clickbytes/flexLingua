import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const pkg=JSON.parse(await read('package.json'));

test('local verification uses versioned commit and push hooks',async()=>{
  const [commit,push,installer,checker]=await Promise.all([
    '.githooks/pre-commit','.githooks/pre-push',
    'tools/install-local-hooks.mjs','tools/local-check.mjs'
  ].map(read));
  assert.match(commit,/^#!\/bin\/sh\nexec node tools\/local-check\.mjs quick\n$/u);
  assert.match(push,/^#!\/bin\/sh\nexec node tools\/local-check\.mjs full\n$/u);
  assert.match(installer,/core\.hooksPath.*\.githooks/u);
  assert.match(checker,/a1-evidence-ledger\.mjs.*--catalog-only/u);
  assert.match(checker,/check:release/u);
  assert.match(checker,/sourceSha:sha/u);
  assert.match(checker,/status:result\.code===0\?'PASS':'FAIL'/u);
});

test('local scripts retain the full suite and bounded A1 H1 pilot',async()=>{
  assert.equal(pkg.scripts['setup:local-hooks'],'node tools/install-local-hooks.mjs');
  assert.equal(pkg.scripts['check:local:quick'],'node tools/local-check.mjs quick');
  assert.equal(pkg.scripts['check:local'],'node tools/local-check.mjs full');
  assert.match(pkg.scripts['check:release'],/npm test/u);
  assert.match(pkg.scripts['check:release'],/check:a1-evidence/u);
  const pilot=JSON.parse(await read('data/coverage/a1-heldout-v1.json'));
  assert.equal(pilot.groups.flatMap(group=>group.pairs).length,100);
  assert.equal(pilot.unsupported.length,20);
});

test('hosted test workflows are disabled',async()=>{
  const path=new URL('../.github/workflows/',import.meta.url);
  const entries=await readdir(path).catch(error=>{
    if(error.code==='ENOENT')return [];
    throw error;
  });
  assert.deepEqual(entries.filter(name=>/\.ya?ml$/u.test(name)),[]);
});
