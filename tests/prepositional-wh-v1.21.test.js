import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('F2: governed preposition WH has one unfilled targetRole in both languages',()=>{
  const engine=make();
  for(const [from,to,input,expected] of [
    ['en','pl','What does the girl look at?','Na co patrzy dziewczynka?'],
    ['pl','en','Na co patrzy dziewczynka?','What does a girl look at?'],
    ['en','pl','What did the girl look at?','Na co patrzyła dziewczynka?'],
    ['pl','en','Na co nie patrzy dziewczynka?','What does a girl not look at?']
  ]){
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected,input);
    const q=result.interlingua;
    assert.equal(q.type,'question');
    assert.equal(q.questionType,'wh');
    assert.equal(q.targetRole,'theme');
    assert.equal(q.proposition.concept,'event.visual_attention');
    assert.equal(Object.hasOwn(q.proposition.roles,'theme'),false);
    assert.equal(q.proposition.roles.agent.concept,'person.girl');
    assert.equal(validateInterlingua(q,engine.ontology,engine.features),q);
    const reread=engine.analyze({from:to,text:result.text});
    assert.equal(reread.targetRole,'theme');
    assert.equal(reread.proposition.concept,q.proposition.concept);
    assert.equal(reread.proposition.features.tense,q.proposition.features.tense);
    assert.equal(reread.proposition.features.polarity,q.proposition.features.polarity);
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(q)}),q);
  }
});

test('F2: fronted Polish na co works compositionally with modality',()=>{
  const engine=make();
  for(const [from,to,input,expected] of [
    ['en','pl','What can the girl look at?','Na co może patrzeć dziewczynka?'],
    ['pl','en','Na co może patrzeć dziewczynka?','What can a girl look at?']
  ]){
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected);
    const question=result.interlingua;
    assert.equal(question.questionType,'wh');
    assert.equal(question.targetRole,'theme');
    assert.equal(question.proposition.type,'modality');
    assert.equal(question.proposition.operator,'modality.ability');
    assert.equal(question.proposition.operand.concept,'event.visual_attention');
    assert.equal(Object.hasOwn(question.proposition.operand.roles,'theme'),false);
    const reread=engine.analyze({from:to,text:expected});
    assert.equal(reread.proposition.operator,'modality.ability');
    assert.equal(reread.targetRole,'theme');
  }
});

test('F2: non-WH predicates and ordinary object questions are unchanged',()=>{
  const engine=make();
  assert.equal(engine.translate({from:'en',to:'pl',
    text:'Does the girl look at the dog?'}).text,'Czy dziewczynka patrzy na psa?');
  assert.equal(engine.translate({from:'pl',to:'en',
    text:'Kto patrzy na psa?'}).text,'Who looks at a dog?');
  assert.equal(engine.translate({from:'en',to:'pl',
    text:'What does the girl pick up?'}).text,'Co podnosi dziewczynka?');
  assert.equal(engine.translate({from:'en',to:'pl',
    text:'What does the girl see?'}).text,'Co widzi dziewczynka?');
});

test('F2: missing/incorrect prepositions and unlicensed questions are rejected',()=>{
  const engine=make();
  for(const [from,input] of [
    ['en','What does the girl look?'],
    ['en','What does the girl look into?'],
    ['pl','Co patrzy dziewczynka?'],
    ['pl','Na co widzi dziewczynka?'],
    ['pl','Pod co patrzy dziewczynka?'],
    ['pl','Na co patrzy dziewczynka.'],
    ['en','What does the girl look at the dog?']
  ]) {
    assert.equal(engine.tryTranslate({from,to:from==='en'?'pl':'en',text:input}).ok,false,input);
  }
});

test('F2: only well-formed declarative preposition metadata is accepted',()=>{
  const invalid=structuredClone(pg);
  invalid.frames['event.visual_attention'].whTheme={frontPreposition:'<script>'};
  assert.throws(()=>createRuleAdapter(pl,invalid),/Invalid linearizations/i);
  const unsupported=structuredClone(eg);
  unsupported.frames['event.visual_attention'].whTheme={frontPreposition:'at'};
  assert.throws(()=>createRuleAdapter(en,unsupported),/Invalid linearizations/i);
});
