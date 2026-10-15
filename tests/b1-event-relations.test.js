import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createDiscourse,createEventRelation,validateInterlingua} from '../js/core/interlingua.js';

const get=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,plGrammar,enGrammar]=await Promise.all([
  'data/concepts.json','data/features.json','data/pl.json','data/en.json',
  'data/grammar/pl.json','data/grammar/en.json'
].map(get));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));

const gold=[
  {language:'en',text:'The girl saw the dog. The boy gave the girl an apple.'},
  {language:'pl',text:'Dziewczynka widziała psa. Chłopiec dał dziewczynce jabłko.'}
];

test('PL/EN ordered event gold does not infer causality from sentence order',()=>{
  assert.equal(engine.capabilities().eventRelationDocumentVersion,'1.28');
  for(const row of gold) {
    const meaning=engine.analyze({text:row.text,from:row.language});
    assert.equal(meaning.type,'discourse');
    assert.deepEqual(meaning.relations,[{type:'precedes',from:'e1',to:'e2'}]);
    const causal=engine.analyze({text:row.text,from:row.language,context:{
      eventRelations:[{type:'because',from:'e1',to:'e2'}]
    }});
    assert.equal(causal.version,'1.28');
    assert.deepEqual(causal.relations,[
      {type:'precedes',from:'e1',to:'e2'},
      {type:'event_relation.because',from:'e1',to:'e2'}
    ]);
    assert.deepEqual(causal.events.map(event=>event.id),['e1','e2']);
    assert.deepEqual(causal.events.map(event=>event.roles),meaning.events.map(event=>event.roles));
    const wire=engine.realize({interlingua:causal,to:'core'}).text;
    assert.deepEqual(engine.analyze({text:wire,from:'core'}),causal);
    for(const target of ['en','pl']) {
      const output=engine.realize({interlingua:causal,to:target});
      assert.equal(output.interlingua.relations[1].type,'event_relation.because');
      assert.ok(output.text.length>0);
    }
  }
});

test('Typed before, after and because relations retain their event references',()=>{
  const source=engine.analyze({text:gold[0].text,from:'en'});
  const eventDocs=source.events.map(event=>({
    version:'0.2',type:'event',concept:event.concept,
    roles:Object.fromEntries(Object.entries(event.roles).map(([role,id])=>
      [role,source.entities[id]])),features:event.features
  }));
  for(const type of ['before','after','because']) {
    const graph=createDiscourse(eventDocs,{relations:[createEventRelation(type,'e1','e2')]});
    assert.equal(graph.version,'1.28');
    assert.equal(graph.relations.at(-1).type,'event_relation.'+type);
    assert.equal(graph.relations.at(-1).from,'e1');
    assert.equal(graph.relations.at(-1).to,'e2');
    assert.deepEqual(graph.events.map(event=>event.roles),source.events.map(event=>event.roles));
    assert.doesNotThrow(()=>validateInterlingua(graph,engine.ontology,engine.features));
  }
});

test('Typed event relation validation rejects cycles and missing causes',()=>{
  const source=engine.analyze({text:gold[0].text,from:'en'});
  const eventDocs=source.events.map(event=>({
    version:'0.2',type:'event',concept:event.concept,
    roles:Object.fromEntries(Object.entries(event.roles).map(([role,id])=>
      [role,source.entities[id]])),features:event.features
  }));
  assert.throws(()=>createDiscourse(eventDocs,{relations:[
    createEventRelation('because','e1','e2'),createEventRelation('because','e2','e1')
  ]}),/acyclic/);
  assert.throws(()=>createDiscourse(eventDocs,{relations:[
    createEventRelation('before','e1','e2'),createEventRelation('after','e1','e2')
  ]}),/acyclic/);
  assert.throws(()=>createDiscourse(eventDocs,{relations:[
    createEventRelation('because','e1','e3')
  ]}),/unresolved typed event relation/);
  const graph=createDiscourse(eventDocs,{relations:[
    createEventRelation('because','e1','e2')
  ]});
  graph.relations.at(-1).to='e3';
  assert.throws(()=>validateInterlingua(graph,engine.ontology,engine.features),/existing events/);
});
