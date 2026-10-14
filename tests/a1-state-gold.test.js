import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createIdentity,createNegation,createPossession,createPredication,participant} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,gold]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','tests/fixtures/gold-state-a1.json'
].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));

function participantFrom(spec) {
  if(spec.anchor)return {
    referent:{kind:'deictic',anchor:spec.anchor},
    agreement:{person:spec.person,number:spec.number}
  };
  return participant(spec.concept,'unknown',spec.number);
}

function coreDocument(row) {
  const role=key=>participantFrom(row.roles[key]);
  const features={tense:row.tense};
  let state;
  if(row.kind==='identity')
    state=createIdentity(role('subject'),role('complement'),features);
  else if(row.kind==='predication')
    state=createPredication(row.predicate,role('subject'),features);
  else if(row.kind==='possession')
    state=createPossession(role('owner'),role('owned'),features);
  else throw new Error('Unknown state kind in gold: '+row.kind);
  return row.polarity==='negative'?createNegation(state):state;
}

function signature(document) {
  let node=document;
  let polarity='positive';
  if(node.type==='scope'&&node.operator==='not'){
    polarity='negative';
    node=node.operand;
  }
  if(node.features?.polarity==='negative')polarity='negative';
  const roles=Object.fromEntries(Object.entries(node.roles).map(([name,ref])=>[
    name,ref.referent?.kind==='deictic'?
      {anchor:ref.referent.anchor,person:ref.agreement.person,number:ref.agreement.number}:
      {concept:ref.concept,number:ref.features.number}
  ]));
  return {
    kind:node.kind,
    ...(node.kind==='predication'?{predicate:node.predicate}:{}),
    roles,
    tense:node.features.tense,
    polarity
  };
}

test('STATE-04 freezes 40 independent bilingual state examples with semantic gold',()=>{
  assert.equal(gold.schemaVersion,1);
  assert.equal(gold.license,'project-authored');
  assert.equal(gold.enToPl.length,20);
  assert.equal(gold.plToEn.length,20);
  assert.equal(new Set(gold.enToPl.map(row=>row.input)).size,20);
  assert.equal(new Set(gold.plToEn.map(row=>row.input)).size,20);
  assert.equal(new Set(gold.enToPl.map(row=>JSON.stringify(row.core))).size,20);
  assert.equal(new Set(gold.plToEn.map(row=>JSON.stringify(row.core))).size,20);

  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]){
    for(const row of rows){
      const output=engine.translate({text:row.input,from,to});
      assert.equal(output.text,row.expected,row.id+' target surface');
      assert.deepEqual(signature(engine.analyze({text:row.input,from})),row.core,
        row.id+' source CORE meaning');
      assert.deepEqual(signature(output.interlingua),row.core,row.id+' translated CORE meaning');
      assert.deepEqual(signature(engine.analyze({text:output.text,from:to})),row.core,
        row.id+' target CORE meaning');
      const serialized=engine.realize({interlingua:output.interlingua,to:'core'}).text;
      assert.deepEqual(engine.analyze({text:serialized,from:'core'}),output.interlingua,
        row.id+' CORE JSON round trip');
    }
  }
});

test('STATE-04 CORE gold preserves identity, predication, possession, negation, tense, and number',()=>{
  assert.equal(gold.coreCases.length,6);
  assert.deepEqual(new Set(gold.coreCases.map(row=>row.kind)),
    new Set(['identity','predication','possession']));
  assert.deepEqual(new Set(gold.coreCases.map(row=>row.polarity)),
    new Set(['positive','negative']));

  for(const row of gold.coreCases){
    const document=coreDocument(row);
    const serialized=engine.realize({interlingua:document,to:'core'}).text;
    const analyzed=engine.analyze({text:serialized,from:'core'});
    assert.deepEqual(analyzed,document,row.id+' CORE JSON round trip');
    assert.deepEqual(signature(analyzed),{
      kind:row.kind,
      ...(row.kind==='predication'?{predicate:row.predicate}:{}),
      roles:row.roles,
      tense:row.tense,
      polarity:row.polarity
    },row.id+' semantic signature');
  }
});

test('STATE-04 unsupported identity, English state negation, and bad agreement return diagnostics',()=>{
  assert.ok(gold.unsupported.some(row=>row.reason==='identity-language-frame-unavailable'));
  assert.ok(gold.unsupported.some(row=>row.reason==='english-state-negation-unavailable'));
  assert.ok(gold.unsupported.some(row=>row.reason==='invalid-subject-agreement'));
  assert.ok(gold.unsupported.some(row=>row.reason==='invalid-adjective-agreement'));
  for(const row of gold.unsupported){
    const result=engine.tryTranslate({text:row.input,from:row.from,to:row.to});
    assert.equal(result.ok,false,row.id+' must fail closed');
    assert.equal(typeof result.error?.code,'string',row.id+' diagnostic code');
    assert.equal(typeof result.error?.message,'string',row.id+' diagnostic message');
    assert.ok(result.error.message.length>0,row.id+' non-empty diagnostic');
  }
  for(const row of gold.invalidCore){
    const result=engine.tryTranslate({text:JSON.stringify(row.document),from:'core',to:'en'});
    assert.equal(result.ok,false,row.id+' must reject a property used as an entity');
    assert.equal(typeof result.error?.code,'string',row.id+' diagnostic code');
    assert.ok(result.error?.message?.length>0,row.id+' diagnostic message');
  }
});
