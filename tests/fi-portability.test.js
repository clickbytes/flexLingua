import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runLanguageConformance} from '../tools/language-conformance-lib.mjs';

const CASES=['nominative','genitive','partitive','inessive','elative','illative',
  'adessive','ablative','allative','translative'];
const fixturePath='tests/fixtures/gold-fi-pilot.json';
const [fixture,manifest,morphology]=await Promise.all([
  readFile(new URL('./fixtures/gold-fi-pilot.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../data/languages/fi.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../data/morphology/fi.json',import.meta.url),'utf8').then(JSON.parse)
]);

test('Finnish manifest declares only the controlled ten-case, one-frame slice',()=>{
  assert.equal(manifest.status,'controlled-subset');
  assert.deepEqual(manifest.capabilities.frames,['event.visual_attention']);
  assert.deepEqual(morphology.featureProfile.syntactic.case,CASES);
  assert.deepEqual(morphology.featureProfile.morphology.case,CASES);
  const slots=morphology.paradigms['fi.noun.talo.type1'].slots;
  assert.equal(slots.length,20);
  assert.equal(new Set(slots.map(slot=>`${slot.features.number}:${slot.features.case}`)).size,20);
  assert.equal(fixture.cases.filter(row=>row.operation==='morphology').length,20);
});

test('Finnish static gold checks both directions, typed CORE roles, and inverse case cells',async()=>{
  const report=await runLanguageConformance({fixturePath});
  const failures=report.cases.filter(row=>row.status==='fail');
  assert.equal(report.status,'pass',JSON.stringify(failures,null,2));
  assert.equal(report.totals.cases,fixture.cases.length);
  assert.equal(report.totals.pass,fixture.cases.length);

  const morphologyCases=report.cases.filter(row=>row.capability==='morphology');
  assert.equal(morphologyCases.length,20);
  for(const row of morphologyCases) {
    assert.deepEqual(row.actualForms,row.expectedForms,row.id);
    assert.equal(row.reverseFound,true,row.id);
    assert.ok(row.reverseFeatures.some(features=>
      features.number===row.features.number && features.case===row.features.case),row.id);
  }

  const translations=report.cases.filter(row=>row.capability==='end_to_end');
  assert.equal(translations.filter(row=>row.from==='en'&&row.to==='fi').length,10);
  assert.equal(translations.filter(row=>row.from==='fi'&&row.to==='en').length,10);
  for(const row of translations) {
    assert.equal(row.actualCore.type,'event',row.id);
    assert.equal(row.actualCore.concept,'event.visual_attention',row.id);
    assert.ok(row.actualCore.roles.agent.concept,row.id);
    assert.ok(row.actualCore.roles.theme.concept,row.id);
    assert.equal(row.actualCore.features.tense,'present',row.id);
    assert.equal(row.actualCore.features.polarity,'positive',row.id);
    if(row.from==='fi')assert.ok(row.warnings.some(warning=>
      warning.includes('Source does not specify definiteness')),row.id);
  }

  const loss=report.cases.find(row=>row.id==='FI-LOSS-01');
  assert.equal(loss.status,'pass');
  assert.ok(loss.warnings.some(warning=>warning.includes('Source does not specify definiteness')));
  const refusal=report.cases.filter(row=>row.capability==='refusal');
  assert.equal(refusal.length,3);
  assert.ok(refusal.every(row=>row.status==='pass'));

  const fi=report.packages.find(item=>item.language==='fi');
  assert.equal(fi.capabilities.morphology.status,'pass');
  assert.equal(fi.capabilities.syntax.status,'pass');
  assert.equal(fi.capabilities.core_semantics.status,'pass');
  assert.equal(fi.capabilities.end_to_end.status,'pass');
  assert.equal(fi.capabilities.information_loss.status,'pass');
  assert.equal(fi.capabilities.questions.status,'unsupported');
});
