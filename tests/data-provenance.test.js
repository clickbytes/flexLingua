import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDataPackageInventory,validateDataProvenance} from '../tools/data-provenance-lib.mjs';

const dataRoot=join(dirname(fileURLToPath(import.meta.url)),'..','data');
const manifest=JSON.parse(await readFile(join(dataRoot,'provenance.json'),'utf8'));
const inventory=await readDataPackageInventory(dataRoot);

test('every shipped data package has versioned provenance or an explicit migration record',()=>{
  const result=validateDataProvenance(manifest,inventory);
  assert.ok(result.packages>=16);
  assert.ok(result.projectAuthored>=6);
  assert.ok(result.legacyReviewRequired>=10);
  assert.equal(result.packages,manifest.packages.length);
});

test('an unregistered new data package fails the provenance gate',()=>{
  assert.throws(()=>validateDataProvenance(manifest,[...inventory,
    {path:'data/new-batch.json',version:'1.0'}]),/No provenance record/);
});

test('legacy packages must name the work needed before expansion or reuse',()=>{
  const changed=structuredClone(manifest);
  delete changed.packages.find(entry=>entry.status==='legacy-review-required').migrationNote;
  assert.throws(()=>validateDataProvenance(changed,inventory),/needs a migration note/);
});

test('provenance versions must track the current data package version',()=>{
  const changed=structuredClone(manifest);
  changed.packages.find(entry=>entry.path==='data/pl.json').version='0.9';
  assert.throws(()=>validateDataProvenance(changed,inventory),/version does not match/);
});
