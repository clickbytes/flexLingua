import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,gold]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','tests/fixtures/gold-person-a1.json'
].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

function project(document) {
  let node=document;
  let questionType=null;
  let polarity='positive';
  let operator=null;
  if(node.type==='question'){
    questionType=node.questionType==='yes_no'?'yes-no':node.questionType;
    node=node.proposition;
  }
  if(node.type==='scope'){
    polarity='negative';
    node=node.operand;
  }
  if(node.type==='modality'){
    operator=node.operator;
    node=node.operand;
    if(node.type==='scope'){
      polarity='negative';
      node=node.operand;
    }
  }
  if(node.features?.polarity==='negative')polarity='negative';
  const subject=node.roles.agent;
  const meaning={
    concept:node.concept,
    anchor:subject.referent?.anchor??null,
    person:subject.agreement?.person??null,
    number:subject.agreement?.number??subject.features?.number??null,
    tense:node.features.tense,
    polarity,
    operator,
    questionType
  };
  if(node.roles.theme?.concept)meaning.theme=node.roles.theme.concept;
  return meaning;
}

function expected(row) {
  return {
    concept:row.concept,
    anchor:row.meaning.anchor,
    person:row.meaning.person,
    number:row.meaning.number,
    tense:row.meaning.tense??'present',
    polarity:row.meaning.polarity??'positive',
    operator:row.meaning.operator??null,
    questionType:row.meaning.questionType??null,
    ...(row.meaning.theme?{theme:row.meaning.theme}:{})
  };
}

function verify(row,from,to) {
  const signature=expected(row);
  const result=engine.translate({text:row.input,from,to});
  assert.equal(result.text,row.expected,row.id+' output');
  assert.deepEqual(project(result.interlingua),signature,row.id+' CORE meaning');
  assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
    result.interlingua,row.id+' CORE JSON round trip');

  const sourceReadings=engine.analyzeCandidates({text:row.input,from});
  assert.ok(sourceReadings.some(item=>JSON.stringify(project(item.interlingua))===JSON.stringify(signature)),
    row.id+' source analysis');
  const targetReadings=engine.analyzeCandidates({text:result.text,from:to});
  assert.ok(targetReadings.some(item=>JSON.stringify(project(item.interlingua))===JSON.stringify(signature)),
    row.id+' target analysis');

  if(row.alternative){
    const alternate=result.semanticAlternatives.find(item=>item.text===row.alternative);
    assert.ok(alternate,row.id+' missing number alternative '+row.alternative);
    assert.deepEqual(project(alternate.interlingua),{...signature,number:'plural'},
      row.id+' alternate meaning');
  }
}

test('PERS-06: 40 independent first/second-person gold cases preserve meaning both ways',()=>{
  assert.equal(gold.enToPl.length,20);
  assert.equal(gold.plToEn.length,20);
  for(const row of gold.enToPl)verify(row,'en','pl');
  for(const row of gold.plToEn)verify(row,'pl','en');
});

test('PERS-06: invalid person, auxiliary, verb and modal agreement is rejected',()=>{
  assert.equal(gold.invalid.length,10);
  for(const row of gold.invalid){
    const result=engine.tryTranslate({text:row.input,from:row.from,to:row.from==='en'?'pl':'en'});
    assert.equal(result.ok,false,row.id+' '+row.input);
  }
});

test('PERS-06 fixture records project authorship and the declared person gold scope',()=>{
  assert.equal(gold.schemaVersion,1);
  assert.equal(gold.license,'project-authored');
  assert.equal(gold.morphology.length,0);
  for(const row of [...gold.enToPl,...gold.plToEn]){
    assert.ok(['speaker','addressee'].includes(row.meaning.anchor),row.id);
    assert.ok(['first','second'].includes(row.meaning.person),row.id);
    assert.ok(['singular','plural'].includes(row.meaning.number),row.id);
  }
});
