import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createEvent,createDialogueAct,participant,validateInterlingua} from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(read));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));
const serviceConcepts=[
  'object.bread','beverage.water','beverage.milk','beverage.coffee','beverage.tea',
  'vehicle.bus','vehicle.train','place.hotel','place.restaurant','place.airport',
  'place.street','object.map','object.suitcase','object.passport','place.market',
  'currency.euro','currency.dollar','currency.zloty','place.stop','place.platform',
  'object.reservation','object.luggage','object.journey','object.charger','place.cafe',
  'vehicle.taxi','place.pharmacy','place.bridge','place.road','object.cash'
];

test('A2-03: bilingual purchase keeps the exact requested quantity and term',()=>{
  for(const [from,to,input,expected] of [
    ['en','pl','The girl buys two tickets tomorrow.','Dziewczynka kupuje dwa bilety jutro.'],
    ['pl','en','Dziewczynka kupuje dwa bilety jutro.','A girl buys two tickets tomorrow.']
  ]) {
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected);
    assert.equal(result.interlingua.concept,'event.purchase');
    assert.equal(result.interlingua.roles.theme.concept,'object.ticket');
    assert.deepEqual(result.interlingua.roles.theme.quantifier,{kind:'exact',value:2});
    assert.equal(result.interlingua.timeReference,'tomorrow');
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
      result.interlingua);
  }
});

test('A2-03: prices retain exact amounts and a typed currency in both directions',()=>{
  for(const [from,to,input,expected] of [
    ['en','pl','The ticket costs three euros.','Bilet kosztuje trzy euro.'],
    ['pl','en','Bilet kosztuje trzy euro.','A ticket costs three euros.']
  ]) {
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,expected);
    assert.equal(result.interlingua.concept,'event.cost');
    assert.equal(result.interlingua.roles.theme.concept,'currency.euro');
    assert.deepEqual(result.interlingua.roles.theme.quantifier,{kind:'exact',value:3});
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
      result.interlingua);
  }
});

test('A2-03: routes, preferences and polite service requests remain typed',()=>{
  const route=engine.translate({from:'en',to:'pl',
    text:'The girl goes to the station tomorrow.'});
  assert.equal(route.interlingua.roles.destination.concept,'place.station');
  assert.equal(route.interlingua.timeReference,'tomorrow');
  const preference=engine.translate({from:'en',to:'pl',
    text:'The girl prefers the train to the bus.'});
  assert.equal(preference.interlingua.concept,'event.preference');
  assert.equal(preference.interlingua.roles.preferred.concept,'vehicle.train');
  assert.equal(preference.interlingua.roles.alternative.concept,'vehicle.bus');
  const request=engine.translate({from:'en',to:'pl',text:'Please buy two tickets.'});
  assert.equal(request.interlingua.act,'request');
  assert.equal(request.interlingua.payload.action.concept,'event.purchase');
  assert.equal(request.interlingua.payload.action.roles.agent.referent.anchor,'addressee');
  assert.deepEqual(request.interlingua.payload.action.roles.theme.quantifier,
    {kind:'exact',value:2});
});

test('A2-03: missing amounts and non-currency price participants are rejected',()=>{
  assert.throws(()=>engine.analyze({from:'en',text:'The ticket costs euros.'}),
    /exact numeric amount and currency/u);
  const unpriced=createEvent('event.cost',{
    agent:participant('object.ticket'),theme:participant('currency.euro')
  },{tense:'present',polarity:'positive'});
  assert.throws(()=>validateInterlingua(unpriced,engine.ontology,engine.features),
    /exact numeric amount and currency/u);
  const wrongUnit=createEvent('event.cost',{
    agent:participant('object.ticket'),
    theme:participant('object.book','indefinite','plural',{
      quantifier:{kind:'exact',value:3}
    })
  },{tense:'present',polarity:'positive'});
  assert.throws(()=>validateInterlingua(wrongUnit,engine.ontology,engine.features),
    /role type currency/u);
});

test('A2-03: service inventory adds at least 30 authored senses in both lexicons',()=>{
  assert.ok(serviceConcepts.length>=30);
  for(const concept of serviceConcepts)assert.ok(concepts.concepts[concept],concept);
  for(const dictionary of [en,pl]) {
    const senses=dictionary.nouns.flatMap(noun=>noun.senses||[]);
    for(const concept of serviceConcepts) {
      assert.ok(senses.some(sense=>sense.coreRef.id===concept),
        `${dictionary.language}: ${concept}`);
    }
  }
});
