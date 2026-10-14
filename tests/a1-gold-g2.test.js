import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {semanticSignature,validateA1Gold,evaluateA1Gold} from '../tools/a1-gold-lib.mjs';

const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,corpus]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/coverage/a1-gold-g2.json'
].map(load));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('G2: bounded original corpus has 16 rows per direction and eight refusals',()=>{
  assert.equal(validateA1Gold(corpus),true);
  assert.equal(corpus.cases.filter(x=>x.from==='en').length,16);
  assert.equal(corpus.cases.filter(x=>x.from==='pl').length,16);
  assert.equal(corpus.unsupported.length,8);
  assert.equal(new Set(corpus.cases.map(x=>x.feature)).size,5);
});

test('G2: expected text and semantic gold survive bilingual reanalysis',()=>{
  const result=evaluateA1Gold(make(),corpus);
  assert.deepEqual(result.summary,{total:40,passed:40,failed:0},
    JSON.stringify(result.results.filter(x=>!x.passed),null,2));
  assert.deepEqual(result.positive,{total:32,passed:32,failed:0});
  assert.deepEqual(result.negative,{total:8,passed:8,failed:0});
  assert.equal(result.byDirection['en->pl'].total,20);
  assert.equal(result.byDirection['pl->en'].total,20);
  assert.equal(result.cefr.percentage,null);
  for(const item of result.results.filter(x=>x.kind==='positive'))
    assert.deepEqual(item.checks,{surface:true,sourceCore:true,targetCore:true,coreSerialization:true},item.id);
});

test('G2: corrupt oracle gets caught, not circularly accepted',()=>{
  const broken=structuredClone(corpus);
  broken.cases[0].expected='An unrelated translation.';
  broken.cases[1].core.roles.agent.number='singular';
  const report=evaluateA1Gold(make(),broken);
  assert.equal(report.summary.failed,2);
  assert.equal(report.results[0].checks.surface,false);
  assert.equal(report.results[1].checks.sourceCore,false);
  assert.equal(report.results[1].checks.targetCore,false);
});

test('G2: reject duplicate IDs or sources and unsupported directions',()=>{
  const duplicate=structuredClone(corpus);
  duplicate.cases[1].id=duplicate.cases[0].id;
  assert.throws(()=>validateA1Gold(duplicate),/duplicate/);
  const sameInput=structuredClone(corpus);
  sameInput.cases[1].input=sameInput.cases[0].input;
  assert.throws(()=>validateA1Gold(sameInput),/duplicate/);
  const invalid=structuredClone(corpus);
  invalid.cases[0].to='tr';
  assert.throws(()=>validateA1Gold(invalid),/duplicate/);
});

test('G2: role number, scope and WH gap are part of evaluated meaning',()=>{
  const engine=make();
  const plural=semanticSignature(engine.analyze({text:'The girls see the books.',from:'en'}));
  assert.equal(plural.roles.agent.number,'plural');
  assert.equal(plural.roles.theme.number,'plural');
  const noNeed=semanticSignature(engine.analyze({text:'Chłopiec nie musi widzieć psa.',from:'pl'}));
  assert.deepEqual(noNeed.wrappers,['scope:not','modal:modality.obligation']);
  const wh=semanticSignature(engine.analyze({text:'Na co patrzy chłopiec?',from:'pl'}));
  assert.deepEqual(wh.wrappers,['question:wh:theme']);
  assert.equal(Object.hasOwn(wh.roles,'theme'),false);
});
