import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createEvent, participant} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,pg,eg,pm,em,mf]=await Promise.all([
  'data/concepts.json','data/features.json','data/pl.json','data/en.json',
  'data/grammar/pl.json','data/grammar/en.json','data/morphology/pl.json',
  'data/morphology/en.json','data/morphology/features.json'
].map(load));
const core=createCoreLanguage(ontology);
const morphPl=createMorphology(pm,pl,mf,{core});
const morphEn=createMorphology(em,en,mf,{core});
const engine=new Engine(ontology,features)
  .registerMorphology(morphPl).registerMorphology(morphEn)
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:morphPl}))
  .registerLanguage(createRuleAdapter(en,eg,{morphology:morphEn}));

test('SPACE-01: destination is preserved in EN↔PL while intransitive movement stays unchanged',()=>{
  const enToPl=engine.translate({text:'The father goes to school.',from:'en',to:'pl'});
  assert.equal(enToPl.text,'Ojciec idzie do szkoły.');
  assert.equal(enToPl.interlingua.concept,'event.movement.to_destination');
  assert.equal(enToPl.interlingua.roles.destination.concept,'institution.school');
  assert.deepEqual(engine.analyze({text:JSON.stringify(enToPl.interlingua),from:'core'}),
    enToPl.interlingua);

  const plToEn=engine.translate({text:'Ojciec idzie do szkoły.',from:'pl',to:'en'});
  assert.equal(plToEn.text,'A father goes to school.');
  assert.equal(plToEn.interlingua.concept,'event.movement.to_destination');
  assert.equal(plToEn.interlingua.roles.destination.concept,'institution.school');

  const intransitive=engine.translate({text:'The father goes.',from:'en',to:'pl'});
  assert.equal(intransitive.text,'Ojciec idzie.');
  assert.equal(intransitive.interlingua.concept,'event.movement');
  assert.deepEqual(Object.keys(intransitive.interlingua.roles),['agent']);
});

test('SPACE-01: incomplete and mistyped destination roles are rejected',()=>{
  for(const [from,text] of [
    ['en','The father goes to.'],['pl','Ojciec idzie do.']
  ]) {
    assert.equal(engine.tryTranslate({text,from,to:from==='en'?'pl':'en'}).ok,false,text);
  }
  const invalid=createEvent('event.movement.to_destination',{
    agent:participant('person.father','definite'),
    destination:participant('person.girl','definite')
  },{tense:'present',polarity:'positive',aspect:'unknown'});
  assert.throws(()=>engine.realize({interlingua:invalid,to:'en'}),/role type place/u);
});
