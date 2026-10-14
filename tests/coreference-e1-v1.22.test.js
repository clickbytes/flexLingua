import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createDiscourse,createEvent,participant,validateInterlingua,
  validateCoreferenceMap,sameDiscourseReferent} from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(read));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));
const context={coreference:{'e2.theme':'e1.theme','e2.agent':'e1.agent'}};
const source='The girl sees the bank. The girl sees the bank.';

test('E1: explicit identity filters incompatible polysemous readings, retaining all valid senses',()=>{
  const engine=make();
  const unlinked=engine.analyzeCandidates({from:'en',text:source});
  const linked=engine.analyzeCandidates({from:'en',text:source,context});
  assert.equal(unlinked.length,4);
  assert.equal(linked.length,2);
  assert.deepEqual(new Set(linked.map(c=>
    c.interlingua.entities[c.interlingua.events[0].roles.theme].concept)),
    new Set(['place.financial_institution','place.riverbank']));
  for(const candidate of linked){
    const graph=candidate.interlingua;
    assert.equal(graph.events[0].roles.theme,graph.events[1].roles.theme);
    assert.equal(graph.events[0].roles.agent,graph.events[1].roles.agent);
    assert.equal(Object.keys(graph.entities).length,2);
    assert.equal(validateInterlingua(graph,engine.ontology,engine.features),graph);
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(graph)}),graph);
  }
  const translation=engine.translate({from:'en',to:'pl',text:source,context});
  assert.equal(translation.semanticAlternatives.length,1);
  assert.notEqual(translation.interlingua.entities[translation.interlingua.events[0].roles.theme].concept,
    translation.semanticAlternatives[0].interlingua.entities[
      translation.semanticAlternatives[0].interlingua.events[0].roles.theme].concept);
});

test('E1: contradictions and bad identifiers produce actionable INVALID_COREFERENCE diagnostics',()=>{
  const engine=make();
  const cases=[
    ['The girl sees the dog. The girl sees the cat.',{'e2.theme':'e1.theme'},/e2\.theme.*e1\.theme/],
    [source,{'e2.invalid':'e1.theme'},/source role: e2\.invalid/],
    [source,{'e2.theme':'e1.invalid'},/target role: e1\.invalid/],
    [source,{'e2.agent':'e3.agent'},/earlier event/],
    [source,{'e1.agent':'e2.agent'},/earlier event/],
    [source,{'e3.agent':'e1.agent'},/source event: e3\.agent/]
  ];
  for(const [text,links,message] of cases){
    const result=engine.tryTranslate({from:'en',to:'pl',text,context:{coreference:links}});
    assert.equal(result.ok,false,JSON.stringify(links));
    assert.equal(result.error.code,'INVALID_COREFERENCE');
    assert.match(result.error.message,message);
  }
});

test('E1: identical references are order-insensitive but never inferred from words',()=>{
  const orderA={concept:'person.girl',features:{number:'singular',definiteness:'definite'}};
  const orderB={features:{definiteness:'definite',number:'singular'},concept:'person.girl'};
  assert.equal(sameDiscourseReferent(orderA,orderB),true);
  assert.equal(sameDiscourseReferent(undefined,undefined),false);
  assert.equal(sameDiscourseReferent(null,null),false);
  assert.equal(sameDiscourseReferent(orderA,{...orderA,
    features:{number:'singular',definiteness:'indefinite'}}),false);
  assert.equal(sameDiscourseReferent(orderA,participant('person.boy','definite')),false);
  const event=(agent,theme)=>createEvent('event.visual_perception',
    {agent,theme:participant(theme,'definite')},
    {tense:'present',polarity:'positive',aspect:'unknown'});
  const first=event(orderA,'animal.dog'),second=event(orderB,'animal.cat');
  const graph=createDiscourse([first,second],{coreference:{'e2.agent':'e1.agent'}});
  assert.equal(graph.events[0].roles.agent,graph.events[1].roles.agent);
  assert.notEqual(graph.events[0].roles.theme,graph.events[1].roles.theme);
  assert.deepEqual(first.roles.agent,orderA);
  assert.deepEqual(second.roles.agent,orderB);
});

test('E1: validation checks role order, syntax, size and source/target existence',()=>{
  const valid=validateCoreferenceMap({'e2.agent':'e1.agent'},2);
  assert.equal(valid.length,1);
  assert.equal(valid[0].sourceIndex,1);
  assert.equal(valid[0].targetIndex,0);
  for(const invalid of [
    {'e2.agent':'e2.agent'},
    {'e1.agent':'e2.agent'},
    {'e2.agent':'e0.agent'},
    {'e2.agent':'e1.__proto__'},
    JSON.parse('{"__proto__":"e1.agent"}'),
    {'e2.agent':null},
    {'e2.agent':'constructor'},
    Object.fromEntries(Array.from({length:33},(_,i)=>['e2.r'+i,'e1.agent']))
  ])assert.throws(()=>validateCoreferenceMap(invalid,2),/coreference/i);
  assert.throws(()=>validateCoreferenceMap({'e3.agent':'e1.agent'},2),/source event/);
  const first=createEvent('event.visual_perception',{
    agent:participant('person.girl','definite'),
    theme:participant('animal.dog','definite')
  },{tense:'present',polarity:'positive',aspect:'unknown'});
  assert.throws(()=>createDiscourse([first,first],
    {coreference:{'e2.nonexistent':'e1.agent'}}),/source role: e2\.nonexistent/);
  assert.throws(()=>createDiscourse([first,first],
    {coreference:{'e2.theme':'e1.nonexistent'}}),/target role: e1\.nonexistent/);
});

test('E1: unchanged no-context behavior and controlled rejection outside discourse',()=>{
  const engine=make();
  const a=engine.analyze({from:'en',text:'The girl sees the dog. The girl sees the cat.'});
  const b=engine.analyze({from:'en',text:'The girl sees the dog. The girl sees the cat.',
    context:{coreference:{}}});
  assert.deepEqual(a,b);
  assert.notEqual(a.events[0].roles.agent,a.events[1].roles.agent);
  assert.equal(engine.tryTranslate({text:'The girl sees the dog.',from:'en',to:'pl',
    context:{coreference:{'e2.agent':'e1.agent'}}}).error.code,'INVALID_COREFERENCE');
  assert.equal(engine.tryTranslate({text:'Does the girl see the dog?',from:'en',to:'pl',
    context:{coreference:{'e2.agent':'e1.agent'}}}).error.code,'INVALID_COREFERENCE');
  assert.equal(engine.tryTranslate({text:JSON.stringify(a),from:'core',to:'pl',
    context:{coreference:{'e2.agent':'e1.agent'}}}).error.code,'INVALID_COREFERENCE');
  assert.equal(engine.translate({text:'The girl sees the dog.',from:'en',to:'pl'}).text,
    'Dziewczynka widzi psa.');
});
