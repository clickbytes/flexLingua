import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createComparison,createDialogueAct,createModality,validateInterlingua} from '../js/core/interlingua.js';
import {participant} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));

const comparisons=[
  ['en','pl','The dog is bigger than the cat.','Pies jest większy niż kot.','greater'],
  ['pl','en','Pies jest większy niż kot.','A dog is bigger than a cat.','greater'],
  ['en','pl','The book is smaller than the cat.','Książka jest mniejsza niż kot.','greater'],
  ['pl','en','Książka jest mniejsza niż kot.','A book is smaller than a cat.','greater'],
  ['en','pl','The dog is less big than the cat.','Pies jest mniej duży niż kot.','less'],
  ['pl','en','Pies jest mniej duży niż kot.','A dog is less big than a cat.','less']
];

const attitudes=[
  ['en','pl','The girl likes the book.','Dziewczynka lubi książkę.','event.liking'],
  ['pl','en','Dziewczynka lubi książkę.','A girl likes a book.','event.liking'],
  ['en','pl','The boy wants a book.','Chłopiec chce książkę.','event.desire'],
  ['pl','en','Chłopiec chce książkę.','A boy wants a book.','event.desire'],
  ['en','pl','The girl prefers a book to an apple.','Dziewczynka woli książkę od jabłka.','event.preference'],
  ['pl','en','Dziewczynka woli książkę od jabłka.','A girl prefers a book to an apple.','event.preference']
];

test('A2-02: comparisons preserve both entities, the property and direction through PL/CORE/EN',()=>{
  for(const [from,to,input,expected,relation] of comparisons) {
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected,input);
    assert.equal(result.interlingua.type,'comparison',input);
    assert.equal(result.interlingua.relation,relation,input);
    assert.ok(result.interlingua.roles.subject.concept,input);
    assert.ok(result.interlingua.roles.standard.concept,input);
    validateInterlingua(result.interlingua,engine.ontology,engine.features);
    const reread=engine.analyze({from:'core',text:JSON.stringify(result.interlingua)});
    assert.equal(reread.predicate,result.interlingua.predicate,input);
    assert.equal(reread.roles.standard.concept,result.interlingua.roles.standard.concept,input);
  }
});

test('A2-02: like, want and prefer retain distinct typed event concepts in both directions',()=>{
  for(const [from,to,input,expected,concept] of attitudes) {
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected,input);
    assert.equal(result.interlingua.type,'event',input);
    assert.equal(result.interlingua.concept,concept,input);
    if(concept==='event.preference') {
      assert.ok(result.interlingua.roles.preferred,input);
      assert.ok(result.interlingua.roles.alternative,input);
    }
    assert.equal(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}).concept,concept,input);
  }
});

test('A2-02: polite requests are typed acts; obligation remains a distinct command',()=>{
  for(const [from,to,input,expected] of [
    ['en','pl','Please read the book.','Proszę czytać książkę.'],
    ['pl','en','Proszę czytać książkę.','Please read a book.'],
    ['en','pl','Please open the book.','Proszę otwierać książkę.'],
    ['pl','en','Proszę otwierać książkę.','Please open a book.']
  ]) {
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected,input);
    assert.equal(result.interlingua.type,'dialogue_act',input);
    assert.equal(result.interlingua.act,'request',input);
    assert.equal(result.interlingua.payload.politeness,'polite',input);
    assert.equal(result.interlingua.payload.action.roles.agent.referent.anchor,'addressee',input);
    validateInterlingua(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
      engine.ontology,engine.features);
  }

  const request=engine.analyze({from:'en',text:'Please read the book.'});
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'Read the book.'}).ok,false);
  const command=createModality('modality.obligation',request.payload.action);
  assert.throws(()=>validateInterlingua(createDialogueAct('request',{
    action:command,politeness:'polite'}),engine.ontology,engine.features),/polite request/u);
  const unknownAspect=engine.analyze({from:'en',text:'Please give the sister a book.'});
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'Please give the sister a book.'}).ok,false);
  assert.equal(unknownAspect.act,'request');
});

test('A2-02: invalid comparison relation, predicate domain and request recipient are rejected',()=>{
  const dog=participant('animal.dog','definite'),cat=participant('animal.cat','definite');
  assert.throws(()=>validateInterlingua({...createComparison('quality.big',dog,cat),relation:'equal'},
    engine.ontology,engine.features),/comparison structure/u);
  assert.throws(()=>validateInterlingua(createComparison('event.read',dog,cat),
    engine.ontology,engine.features),/property concept/u);
  const action=engine.analyze({from:'en',text:'Please read the book.'}).payload.action;
  const wrongRecipient={...action,roles:{...action.roles,agent:participant('person.girl','definite')}};
  assert.throws(()=>validateInterlingua(createDialogueAct('request',{
    action:wrongRecipient,politeness:'polite'}),engine.ontology,engine.features),/addressed to the listener/u);
});
