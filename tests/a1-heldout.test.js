import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {evaluateA1Gold,validateA1Gold} from '../tools/a1-gold-lib.mjs';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,eg,pg,pm,em,mf,fixture]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/morphology/pl.json',
  'data/morphology/en.json','data/morphology/features.json','data/coverage/a1-heldout-v1.json'
].map(load));
const core=createCoreLanguage(ontology);
const plMorph=createMorphology(pm,pl,mf,{core});
const enMorph=createMorphology(em,en,mf,{core});
const make=()=>new Engine(ontology,features).registerMorphology(plMorph).registerMorphology(enMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));

function expandGroup(group){
  return group.pairs.map(pair=>{
    const roles=Object.fromEntries(['agent','theme'].filter(role=>pair[role]!==undefined)
      .map(role=>[role,{concept:pair[role],number:group.roleNumber}]));
    return {...pair,core:{concept:group.concept,roles,tense:pair.tense,
      polarity:pair.polarity,wrappers:pair.wrappers}};
  });
}
const pairs=fixture.groups.flatMap(expandGroup);
const corpus={...fixture,cases:pairs.flatMap(pair=>[
  {id:pair.id.replace('H1-','H1-EN-'),from:'en',to:'pl',input:pair.en,expected:pair.pl,
    feature:pair.feature,core:pair.core},
  {id:pair.id.replace('H1-','H1-PL-'),from:'pl',to:'en',input:pair.pl,expected:pair.en,
    feature:pair.feature,core:pair.core}
])};
const idPolicy={idPrefix:'H1',idWidth:3};

test('VAL-02: frozen H1 contains 100 original pairs and 20 explicit refusals',async t=>{
  assert.equal(fixture.schemaVersion,1);
  assert.equal(fixture.license,'project-authored');
  assert.equal(fixture.dataset.id,'VAL-02-H1');
  assert.equal(fixture.dataset.revision,'H1-v1');
  assert.equal(fixture.dataset.evaluationMode,'productive-morphology');
  assert.equal(fixture.dataset.frozenAfterInitialPilotReview,true);
  assert.match(fixture.dataset.pilotReview,/without copying parser output/);
  assert.match(fixture.dataset.authorImplementerSeparation,/unavailable/);
  assert.equal(pairs.length,100);
  assert.equal(corpus.cases.filter(row=>row.from==='en').length,100);
  assert.equal(corpus.cases.filter(row=>row.from==='pl').length,100);
  assert.equal(fixture.unsupported.length,20);
  assert.deepEqual([...new Set(pairs.map(row=>row.feature))].sort(),
    ['modality','multiword','negation','question','statement']);
  assert.ok(pairs.some(row=>row.tense==='past'));
  assert.ok(pairs.some(row=>row.polarity==='negative'));
  assert.ok(pairs.some(row=>row.wrappers.includes('scope:not')));
  assert.ok(pairs.some(row=>row.wrappers.includes('question:yes_no')));
  assert.ok(pairs.some(row=>row.wrappers.includes('question:wh:theme')));
  assert.equal(validateA1Gold(corpus,idPolicy),true);
  const bytes=await readFile(new URL('../data/coverage/a1-heldout-v1.json',import.meta.url));
  t.diagnostic('VAL-02 H1-v1 SHA-256 '+createHash('sha256').update(bytes).digest('hex'));
});

test('VAL-02: all 200 directional rows round-trip through CORE with detailed failures',()=>{
  const result=evaluateA1Gold(make(),corpus,idPolicy);
  assert.deepEqual(result.summary,{total:220,passed:220,failed:0},
    JSON.stringify(result.results.filter(row=>!row.passed),null,2));
  assert.deepEqual(result.positive,{total:200,passed:200,failed:0});
  assert.deepEqual(result.negative,{total:20,passed:20,failed:0});
  assert.equal(result.byDirection['en->pl'].total,110);
  assert.equal(result.byDirection['pl->en'].total,110);
  assert.equal(result.cefr.percentage,null);
  for(const row of result.results.filter(item=>item.kind==='positive'))
    assert.deepEqual(row.checks,{surface:true,sourceCore:true,targetCore:true,coreSerialization:true},row.id);
});

test('VAL-02: changed expected output or meaning is reported as a failure, never learned',()=>{
  const changed=structuredClone(corpus);
  changed.cases[0].expected='This value must remain wrong.';
  changed.cases[1].core.roles.agent.number='plural';
  const result=evaluateA1Gold(make(),changed,idPolicy);
  assert.equal(result.summary.failed,2);
  assert.equal(result.results[0].checks.surface,false);
  assert.equal(result.results[1].checks.sourceCore,false);
  assert.equal(result.results[1].checks.targetCore,false);
});

test('VAL-02: rejects duplicate IDs and duplicate source sentences',()=>{
  const duplicateId=structuredClone(corpus);
  duplicateId.cases[1].id=duplicateId.cases[0].id;
  assert.throws(()=>validateA1Gold(duplicateId,idPolicy),/duplicate/i);
  const duplicateInput=structuredClone(corpus);
  duplicateInput.cases[2].input=duplicateInput.cases[0].input;
  assert.throws(()=>validateA1Gold(duplicateInput,idPolicy),/duplicate/i);
});
