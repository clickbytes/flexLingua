import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {validateInterlingua,createCoordination,createModality,createNegation,
  createEvent,participant,MAX_CLAUSE_DEPTH} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('Batch D: chart-backed mixed ordinary and modal clauses in both languages',()=>{
  const engine=make();
  const from='The girl can see the dog and the boy sees the cat.';
  const output='Dziewczynka może widzieć psa i chłopiec widzi kota.';
  const result=engine.translate({text:from,from:'en',to:'pl'});
  assert.equal(result.text,output);
  assert.equal(result.interlingua.type,'coordination');
  assert.equal(result.interlingua.clauses.length,2);
  assert.equal(result.interlingua.clauses[0].type,'modality');
  assert.equal(result.interlingua.clauses[1].type,'event');
  assert.deepEqual(engine.analyze({text:result.text,from:'pl'}).clauses.map(c=>c.type),
    ['modality','event']);
});

test('Batch D: modal scope in coordination survives parsing and CORE JSON',()=>{
  const engine=make();
  const source='The girl cannot see the dog and the boy must see the cat.';
  const result=engine.translate({text:source,from:'en',to:'pl'});
  assert.equal(result.text,'Dziewczynka nie może widzieć psa i chłopiec musi widzieć kota.');
  assert.equal(result.interlingua.type,'coordination');
  assert.equal(result.interlingua.clauses[0].type,'scope');
  assert.equal(result.interlingua.clauses[0].operand.type,'modality');
  assert.equal(result.interlingua.clauses[1].type,'modality');
  assert.deepEqual(engine.analyze({from:'core',
    text:JSON.stringify(result.interlingua)}),result.interlingua);
});

test('Batch D: wide negation is distinct from negating only the first modal',()=>{
  const engine=make();
  const source='It is not true that the girl cannot see the dog and the boy must see the cat.';
  const result=engine.translate({text:source,from:'en',to:'pl'});
  assert.equal(result.text,'Nie jest prawdą, że dziewczynka nie może widzieć psa i chłopiec musi widzieć kota.');
  assert.equal(result.interlingua.type,'scope');
  assert.equal(result.interlingua.operand.type,'coordination');
  assert.equal(result.interlingua.operand.clauses[0].type,'scope');
  const local=engine.analyze({text:'The girl cannot see the dog and the boy must see the cat.',from:'en'});
  assert.notDeepEqual(result.interlingua,local);
  assert.equal(engine.analyze({text:result.text,from:'pl'}).type,'scope');
});

test('Batch D: limits reject oversized or malformed coordination and unlicensed gaps',()=>{
  const engine=make();
  const atom='The girl can see the dog';
  assert.equal(engine.tryTranslate({text:Array(5).fill(atom).join(' and ')+'.',
    from:'en',to:'pl'}).ok,false);
  for(const source of [
    'The girl can see the dog and.',
    'The girl and can see the dog.',
    'The girl who sees the dog and the boy sees the cat.',
    'The girl sees the dog and the boy can see.',
    'The girl must see the dog and the boy can the cat.'
  ])assert.equal(engine.tryTranslate({text:source,from:'en',to:'pl'}).ok,false,source);
  assert.equal(MAX_CLAUSE_DEPTH,5);
});

test('Batch D: modal nested clause validator rejects malformed structural content',()=>{
  const engine=make();
  const ref=id=>participant(id,'definite');
  const ev=createEvent('event.visual_perception',
    {agent:ref('person.girl'),theme:ref('animal.dog')},
    {tense:'present',polarity:'positive',aspect:'unknown'});
  const modal=createModality('modality.ability',ev);
  assert.doesNotThrow(()=>validateInterlingua(
    createNegation(createCoordination([createNegation(modal),modal])),
    engine.ontology,engine.features));
  const invalid=createCoordination([modal,{type:'question',questionType:'yes_no',proposition:ev}]);
  assert.throws(()=>validateInterlingua(invalid,engine.ontology,engine.features),/Coordination/);
});

test('Batch D: modal events compose inside validated propositional complements',()=>{
  const engine=make();
  const input='The girl believes that the boy can see the dog.';
  const expected='Dziewczynka wierzy, że chłopiec może widzieć psa.';
  const result=engine.translate({text:input,from:'en',to:'pl'});
  assert.equal(result.text,expected);
  assert.equal(result.interlingua.type,'complement');
  assert.equal(result.interlingua.content.type,'modality');
  assert.equal(result.interlingua.content.operator,'modality.ability');
  const restored=engine.analyze({text:expected,from:'pl'});
  assert.equal(restored.content.type,'modality');
  assert.deepEqual(engine.analyze({text:JSON.stringify(result.interlingua),from:'core'}),result.interlingua);
});
