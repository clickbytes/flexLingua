import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {evaluateA1Gold} from '../tools/a1-gold-lib.mjs';
import {auditA1Gaps} from '../tools/a1-gap-audit-lib.mjs';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,plMorph,enMorph,plGrammar,enGrammar,seed,corpus,manifest]=
  await Promise.all([
    'data/concepts.json','data/features.json','data/pl.json','data/en.json',
    'data/morphology/pl.json','data/morphology/en.json','data/grammar/pl.json','data/grammar/en.json',
    'data/coverage/a1-pilot.json','data/coverage/a1-gold-g2.json','data/coverage/a1-targets.json'
  ].map(load));
const inventory={ontology,pl,en,plMorph,enMorph,plGrammar,enGrammar,seed};
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));
const benchmark=evaluateA1Gold(engine,corpus);
const run=(extra={})=>auditA1Gaps({manifest,inventory,corpus,benchmark,...extra});
const target=(report,id)=>report.targets.find(x=>x.id===id);

test('A1 Batch 2: checklist statuses are evidence-backed, never percentage of CEFR',()=>{
  const report=run();
  assert.equal(report.targetCount,23);
  assert.equal(report.cefr.percentage,null);
  assert.equal(report.scope,'project-authored-A1-checklist-gaps-not-cefr');
  assert.equal(Object.values(report.statusCounts).reduce((a,b)=>a+b,0),23);
  assert.equal(report.validation.benchmarkCases,40);
  assert.ok(report.byDomain.family.targets>=4);
});

test('A1 Batch 2/3: motion and father remain missing, family/read/help gained bilingual coverage',()=>{
  const report=run();
  const movement=target(report,'event.movement');
  assert.equal(movement.ontologyPresent,true);
  assert.ok(movement.pl.lexemeIds.length>0);
  assert.ok(movement.en.lexemeIds.length>0);
  assert.ok(movement.pl.morphologyLexemeIds.length>0);
  assert.equal(movement.pl.grammarFrame,true);
  assert.equal(movement.en.grammarFrame,true);
  assert.equal(movement.status,'without-gold',
    'Movement has separate independent gold, not part of frozen G2 corpus');
  const father=target(report,'person.father');
  assert.equal(father.ontologyPresent,true);
  assert.equal(father.status,'without-gold');
  assert.ok(father.pl.lexemeIds.length>0&&father.en.lexemeIds.length>0);
  assert.ok(father.pl.morphologyLexemeIds.length>0&&father.en.morphologyLexemeIds.length>0);
  assert.ok(father.gaps.includes('core:ontology'));
  for(const id of ['person.sister','person.brother','event.read','event.help']){
    const item=target(report,id);
    assert.equal(item.ontologyPresent,true,id);
    assert.ok(item.pl.lexemeIds.length>0,id+' PL lexicon');
    assert.ok(item.en.lexemeIds.length>0,id+' EN lexicon');
    assert.ok(item.pl.morphologyLexemeIds.length>0,id+' PL morphology');
    assert.ok(item.en.morphologyLexemeIds.length>0,id+' EN morphology');
    if(item.kind==='event'){
      assert.equal(item.pl.grammarFrame,true,id+' PL frame');
      assert.equal(item.en.grammarFrame,true,id+' EN frame');
    }
    assert.equal(item.status,'without-gold',id);
    assert.deepEqual(item.independentGold.observedIds,[],id);
    assert.ok(item.gaps.includes('gold:not-exercised'),id);
    assert.equal(item.gaps.includes('core:ontology'),false,id);
  }
});

test('A1 Batch 2: independent passed corpus actually marks witnessed concepts',()=>{
  const report=run();
  const boy=target(report,'person.boy');
  assert.equal(boy.ontologyPresent,true);
  assert.ok(boy.independentGold.passedIds.length>0);
  assert.ok(boy.en.lexemeIds.length>0);
  const mother=target(report,'person.mother');
  assert.equal(mother.independentGold.observedIds.length,0);
  assert.ok(mother.gaps.includes('gold:not-exercised'));
});

test('A1 Batch 2: failing and missing independent results remain visible',()=>{
  const bad=structuredClone(benchmark);
  const id=corpus.cases[0].id;
  const evidence=bad.results.find(x=>x.id===id);
  evidence.passed=false;
  const report=run({benchmark:bad});
  const boy=target(report,'person.boy');
  assert.ok(boy.independentGold.failedOrMissingIds.includes(id));
  assert.ok(boy.gaps.includes('gold:failed-or-missing-result'));
});

test('A1 Batch 2: reject duplicate checklist IDs and invalid domains',()=>{
  const duplicate=structuredClone(manifest);
  duplicate.targets.push({...duplicate.targets[0]});
  assert.throws(()=>run({manifest:duplicate}),/duplicate/);
  const bad=structuredClone(manifest);
  bad.targets[0].domain='CEFR_A1_complete';
  assert.throws(()=>run({manifest:bad}),/Invalid or duplicate/);
});

test('A1 Batch 3: structural counters include the four new lexemes in each language',()=>{
  const report=run();
  assert.equal(report.validation.benchmarkCases,40,
    'Batch 3 has a separate gold fixture and is not automatically part of G2');
  assert.equal(report.byDomain.family.unmodelled,0,'father now has a CORE entry');
  assert.equal(report.byDomain.family.bilingualLexical,4,
    'mother, sister, brother and father have PL and EN lexemes');
  assert.equal(report.byDomain.activities.unmodelled,0);
  assert.equal(report.byDomain.activities.bilingualLexical,7,
    'all seven planned activities have PL and EN lexemes, including write and open');
  assert.equal(report.cefr.percentage,null);
});

test('A1 Batch 4: father moves to bilingual covered-but-not-G2-sampled status',()=>{
  const result=run();
  const father=target(result,'person.father');
  assert.equal(father.status,'without-gold');
  assert.deepEqual(father.independentGold.observedIds,[]);
  assert.ok(father.gaps.includes('gold:not-exercised'));
  assert.equal(father.gaps.includes('core:ontology'),false);
  assert.equal(result.cefr.percentage,null);
});

test('A1 Batch 5: movement is bilingual with frames and remains outside frozen G2 samples',()=>{
 const report=run();
 const row=target(report,'event.movement');
 assert.equal(row.status,'without-gold');
 assert.deepEqual(row.independentGold.observedIds,[]);
 assert.equal(row.gaps.includes('pl:lexicon'),false);
 assert.equal(row.gaps.includes('pl:frame'),false);
 assert.equal(report.cefr.percentage,null);
});

test('A1 Batch 6: newly available daily activities gain both lexicons, grammar and morphology',()=>{
 const report=run();
 assert.equal(report.targetCount,23);
 assert.equal(report.byDomain.activities.targets,7);
 for(const id of ['event.write','event.open']){
  const item=target(report,id);
  assert.equal(item.ontologyPresent,true,id);
  assert.equal(item.status,'without-gold',id);
  assert.ok(item.pl.lexemeIds.length>0,id);
  assert.ok(item.en.lexemeIds.length>0,id);
  assert.ok(item.pl.morphologyLexemeIds.length>0,id);
  assert.ok(item.en.morphologyLexemeIds.length>0,id);
  assert.equal(item.pl.grammarFrame,true,id);
  assert.equal(item.en.grammarFrame,true,id);
  assert.deepEqual(item.independentGold.observedIds,[],id);
 }
 assert.equal(report.cefr.percentage,null);
});
