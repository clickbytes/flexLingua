import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {A2_GOLD_SHA256,buildA2GoldReport,sha256Text}
  from '../tools/a1-evidence-ledger-lib.mjs';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,targets]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/coverage/a2-targets.json'
].map(load));
const fixtureText=await readFile(new URL('./fixtures/gold-a2.json',import.meta.url),'utf8');
const fixture=JSON.parse(fixtureText);
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));

function assertSemantic(node,expected,label) {
  assert.equal(node.type,expected.type,label+' type');
  if(expected.operator) {
    assert.equal(node.operator,expected.operator,label+' operator');
    assert.equal(node.operand.features.tense,'future',label+' future operand');
    return;
  }
  if(expected.concept)assert.equal(node.concept,expected.concept,label+' concept');
  if(expected.act) {
    assert.equal(node.act,expected.act,label+' act');
    assert.equal(node.payload.politeness,expected.politeness,label+' politeness');
    assert.equal(node.payload.action.roles.agent.referent.anchor,
      expected.requiredAgentAnchor,label+' addressee');
    return;
  }
  for(const role of expected.requiredRoles||[])assert.ok(node.roles[role],label+' role '+role);
  if(expected.priceMustBeExact) {
    assert.equal(node.roles.theme.quantifier.kind,'exact',label+' exact amount');
    assert.equal(engine.ontology.isA(node.roles.theme.concept,'currency'),true,label+' currency type');
  }
}

test('A2-GOLD-01 verifies the frozen bilingual subset and reports separate construction metrics',t=>{
  assert.equal(sha256Text(fixtureText),A2_GOLD_SHA256,'pinned A2 fixture digest');
  assert.equal(fixture.cases.length,50);
  assert.equal(fixture.cases.length*fixture.sentencesPerCase,100);
  assert.equal(targets.scope.sentenceCount,110);
  assert.equal(targets.scope.representativeCefrDenominator,null);
  assert.equal(targets.targets.length,8);

  const results=[];
  for(const row of fixture.cases) {
    const directions={'en->pl':'pass','pl->en':'pass'};
    let semantic='pass';
    for(const [from,to,key,direction] of [
      ['en','pl','enToPl','en->pl'],['pl','en','plToEn','pl->en']
    ]) {
      const sample=row[key],label=row.id+' '+direction;
      const output=engine.translate({text:sample.input,from,to});
      assert.equal(output.text,sample.expected,label+' target sentence');
      assertSemantic(output.interlingua,row.semantic,label+' CORE meaning');
      const source=engine.analyze({text:sample.input,from});
      assertSemantic(source,row.semantic,label+' parsed source');
      const target=engine.analyze({text:sample.expected,from:to});
      assertSemantic(target,row.semantic,label+' parsed target');
      const serialized=engine.realize({interlingua:output.interlingua,to:'core'}).text;
      assert.deepEqual(engine.analyze({text:serialized,from:'core'}),output.interlingua,
        label+' CORE JSON round trip');
    }
    results.push({id:row.id,directions,semantic});
  }
  for(const row of fixture.unsupported) {
    const to=row.from==='en'?'pl':'en';
    const outcome=engine.tryTranslate({text:row.input,from:row.from,to});
    assert.equal(outcome.ok,false,row.id+' must be refused');
    assert.ok(outcome.error.code&&outcome.error.message,row.id+' refusal evidence');
    results.push({id:row.id,status:'pass'});
  }
  const report=buildA2GoldReport({fixture,targets,fixtureSha256:sha256Text(fixtureText),results});
  assert.deepEqual(report.totals,{casePairs:50,positiveSentences:100,negativeSentences:10,
    sentences:110,minimumSentences:100,passedDirections:100,failedDirections:0,
    refusalCases:10,refusalsPassed:10,refusalsFailed:0,semanticChecks:100,
    semanticPassed:100,semanticFailed:0});
  assert.deepEqual(report.cefr,{level:'A2',percentage:null,status:'not-measured',
    licensedDenominator:null,
    reason:'The project-authored controlled sample is not representative and has no licensed CEFR denominator.'});
  t.diagnostic(JSON.stringify({suite:report.suite,totals:report.totals,
    byDirection:report.byDirection,byConstruction:report.byConstruction,
    refusal:report.refusal,semantics:report.semantics,cefr:report.cefr}));
});

test('A2-GOLD-01 refuses an unpinned or shortened evidence set',()=>{
  const results=[...fixture.cases.map(row=>({id:row.id,
    directions:{'en->pl':'pass','pl->en':'pass'},semantic:'pass'})),
    ...fixture.unsupported.map(row=>({id:row.id,status:'pass'}))];
  assert.throws(()=>buildA2GoldReport({fixture,targets,fixtureSha256:'0'.repeat(64),results}),
    /unpinned or incomplete A2 gold/u);
  const shortened=structuredClone(fixture);shortened.minimumSentences=99;
  assert.throws(()=>buildA2GoldReport({fixture:shortened,targets,
    fixtureSha256:A2_GOLD_SHA256,results}),/unpinned or incomplete A2 gold/u);
});

test('A2-GOLD-01 keeps direction, semantic and refusal failures in separate metrics',()=>{
  const results=[...fixture.cases.map(row=>({id:row.id,
    directions:{'en->pl':'pass','pl->en':'pass'},semantic:'pass'})),
    ...fixture.unsupported.map(row=>({id:row.id,status:'pass'}))];
  results.find(row=>row.id===fixture.cases[0].id).directions['en->pl']='fail';
  results.find(row=>row.id===fixture.cases[0].id).semantic='fail';
  results.find(row=>row.id===fixture.unsupported[0].id).status='fail';
  const report=buildA2GoldReport({fixture,targets,fixtureSha256:A2_GOLD_SHA256,results});
  assert.deepEqual(report.byDirection['en->pl'],{passed:49,failed:1});
  assert.deepEqual(report.semantics,{checks:100,passed:98,failed:2});
  assert.deepEqual(report.refusal.byReason['unresolved-polish-aspect'],{
    passed:0,failed:1,byDirection:{'en->pl':1,'pl->en':0}
  });
});
