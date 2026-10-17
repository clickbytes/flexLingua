import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {RESOURCE_LIMITS} from '../js/core/resource-limits.js';

const get = async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,plGrammar,enGrammar]=await Promise.all([
 'data/concepts.json','data/features.json','data/pl.json','data/en.json',
 'data/grammar/pl.json','data/grammar/en.json'
].map(get));
const make=()=>new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));

test('CORE JSON roundtrip preserves safe null-prototype discourse dictionaries',()=>{
 const engine=make();
 const text='The father helps the sister. The sister opens the book.';
 const original=engine.analyze({text,from:'en'});
 assert.equal(original.type,'discourse');
 assert.equal(Object.getPrototypeOf(original.entities),null);
 for(const event of original.events)assert.equal(Object.getPrototypeOf(event.roles),null);
 const decoded=engine.analyze({text:JSON.stringify(original),from:'core'});
 assert.equal(Object.getPrototypeOf(decoded.entities),null);
 for(const event of decoded.events)assert.equal(Object.getPrototypeOf(event.roles),null);
 assert.deepEqual(decoded,original);
 const translated=engine.translate({text:JSON.stringify(original),from:'core',to:'pl'});
 assert.equal(translated.text,'Ojciec pomaga siostrze. Siostra otwiera książkę.');
});
test('CORE discourse rejects unknown fields at every normalized layer',()=>{
 const engine=make();
 const source=engine.analyze({
  text:'The father helps the sister. The sister opens the book.',from:'en'
 });
 const mutations=[
  document=>{document.evidentiality='hearsay';},
  document=>{document.events[0].evidentiality='hearsay';},
  document=>{document.events[0].features.evidentiality='hearsay';},
  document=>{document.events[0].roles.unlicensed='p1';},
  document=>{document.relations[0].evidentiality='hearsay';},
  document=>{document.entities[Object.keys(document.entities)[0]].evidentiality='hearsay';}
 ];
 for(const mutate of mutations){
  const tampered=structuredClone(source);
  mutate(tampered);
  assert.throws(()=>engine.analyze({text:JSON.stringify(tampered),from:'core'}),error=>
   error.name==='EngineError');
 }
});
test('CORE JSON refuses prototype manipulation before discourse normalization',()=>{
 const engine=make();
 const text='The father helps the sister. The sister opens the book.';
 const original=JSON.stringify(engine.analyze({text,from:'en'}));
 const tampered=original.replace('"p1":','"__proto__":');
 assert.notEqual(tampered,original);
 assert.throws(()=>engine.analyze({text:tampered,from:'core'}),error=>
  error.code==='CORE_JSON_UNSAFE_KEY' && /Unsafe CORE JSON key/.test(error.message));
});

test('CORE JSON refusals have stable codes for malformed, oversized and unsafe input',()=>{
 const engine=make();
 const rejected=(text,code)=>assert.throws(()=>engine.analyze({text,from:'core'}),error=>
  error.code===code);
 rejected('{"type":','CORE_JSON_INVALID');
 rejected(' '.repeat(RESOURCE_LIMITS.coreJsonCodeUnits+1),'CORE_JSON_SIZE_LIMIT');
 rejected('{"constructor":{}}','CORE_JSON_UNSAFE_KEY');
 rejected('{"type":"unexpected"}','CORE_SCHEMA_INVALID');
});

test('CORE JSON bounds nesting and total value count before semantic validation',()=>{
 const engine=make();
 const deep='['.repeat(RESOURCE_LIMITS.coreJsonDepth+1)+'0'+
  ']'.repeat(RESOURCE_LIMITS.coreJsonDepth+1);
 const broad=JSON.stringify({values:Array.from({length:RESOURCE_LIMITS.coreJsonNodes},()=>null)});
 assert.throws(()=>engine.analyze({text:deep,from:'core'}),error=>
  error.code==='CORE_JSON_DEPTH_LIMIT');
 assert.throws(()=>engine.analyze({text:broad,from:'core'}),error=>
  error.code==='CORE_JSON_NODE_LIMIT');
});
