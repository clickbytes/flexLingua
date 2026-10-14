import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createDiscourse,createEvent,participant,validateInterlingua}
  from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(read));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('Batch E: repeated surface words never imply shared entity without explicit links',()=>{
  const engine=make();
  const source='The girl sees the dog. The girl sees the cat.';
  const plain=engine.analyze({text:source,from:'en'});
  const linked=engine.analyze({text:source,from:'en',
    context:{coreference:{'e2.agent':'e1.agent'}}});
  assert.equal(plain.type,'discourse');
  assert.equal(Object.keys(plain.entities).length,4);
  assert.notEqual(plain.events[0].roles.agent,plain.events[1].roles.agent);
  assert.equal(Object.keys(linked.entities).length,3);
  assert.equal(linked.events[0].roles.agent,linked.events[1].roles.agent);
  assert.equal(linked.events[0].roles.theme==='p2',true);
  assert.equal(linked.events[1].roles.theme==='p3',true);
  assert.equal(validateInterlingua(linked,engine.ontology,engine.features),linked);
  assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(linked)}),linked);
  assert.equal(engine.realize({interlingua:linked,to:'pl'}).text,
    'Dziewczynka widzi psa. Dziewczynka widzi kota.');
});

test('Batch E: explicit context applies in both PL and EN without rewriting concept identity',()=>{
  const engine=make();
  const meaning=engine.translate({from:'pl',to:'en',
    text:'Dziewczynka widzi psa. Dziewczynka widzi kota.',
    context:{coreference:{'e2.agent':'e1.agent'}}});
  assert.equal(meaning.interlingua.type,'discourse');
  assert.equal(meaning.interlingua.events[0].roles.agent,
    meaning.interlingua.events[1].roles.agent);
  assert.equal(meaning.text,'A girl sees a dog. A girl sees a cat.');
});

test('Batch E: links must reference earlier roles with compatible semantic features',()=>{
  const engine=make();
  const source='The girl sees the dog. The boy sees the dog.';
  for(const bad of [
    {'e2.agent':'e1.agent'},
    {'e1.agent':'e2.agent'},
    {'e2.agent':'e3.agent'},
    {'e9.agent':'e1.agent'},
    {'e2.invalid':'e1.agent'},
    JSON.parse('{"__proto__":"e1.agent"}')
  ]) {
    const result=engine.tryTranslate({text:source,from:'en',to:'pl',
      context:{coreference:bad}});
    assert.equal(result.ok,false,JSON.stringify(bad));
  }
  assert.equal(engine.tryTranslate({text:'The girl sees the dog.',from:'en',to:'pl',
    context:{coreference:{'e1.agent':'e1.agent'}}}).ok,false);
});

test('Batch E: direct symbolic graph construction shares only explicitly identical referents',()=>{
  const f={tense:'present',polarity:'positive',aspect:'unknown'};
  const girl=participant('person.girl','definite');
  const dog=participant('animal.dog','definite');
  const cat=participant('animal.cat','definite');
  const a=createEvent('event.visual_perception',{agent:girl,theme:dog},f);
  const b=createEvent('event.visual_perception',{agent:{...girl},theme:cat},f);
  const graph=createDiscourse([a,b],{coreference:{'e2.agent':'e1.agent'}});
  assert.equal(graph.events[0].roles.agent,graph.events[1].roles.agent);
  assert.throws(()=>createDiscourse([a,b],
    {coreference:{'e2.theme':'e1.theme'}}),/incompatible/);
  assert.throws(()=>createDiscourse([a,b],
    {coreference:{'e2.agent':'e2.agent'}}),/earlier/);
});

test('Batch E: absent pronoun grammar is not silently inferred',()=>{
  const engine=make();
  const result=engine.tryTranslate({text:'She sees the dog.',from:'en',to:'pl'});
  assert.equal(result.ok,false);
});
