import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {semanticSignature,validateA1Gold} from '../tools/a1-gold-lib.mjs';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar,composition]=await Promise.all([
 'data/concepts.json','data/features.json','data/en.json','data/pl.json',
 'data/grammar/en.json','data/grammar/pl.json','tests/fixtures/gold-a1-crossbatch.json'
].map(load));
const engine=new Engine(ontology,features)
 .registerLanguage(createRuleAdapter(en,enGrammar))
 .registerLanguage(createRuleAdapter(pl,plGrammar));

test('VAL-04: semantic signatures retain perfective and imperfective aspect',()=>{
 const perfective=semanticSignature(engine.analyze({
  text:'Dziewczynka dała chłopcu książkę.',from:'pl'
 }));
 const imperfective=semanticSignature(engine.analyze({
  text:'Dziewczynka dawała chłopcu książkę.',from:'pl'
 }));
 assert.equal(perfective.aspect,'perfective');
 assert.equal(imperfective.aspect,'imperfective');
 assert.notEqual(perfective.aspect,imperfective.aspect);
});

test('VAL-04: unsupported aspect declarations fail validation',()=>{
 const changed={schemaVersion:1,license:'project-authored',cases:[{
  id:'G2-EN-01',from:'en',to:'pl',input:'The boy sees the cat.',expected:'Chłopiec widzi kota.',
  feature:'statement',core:{concept:'event.visual_perception',roles:{
   agent:{concept:'person.boy',number:'singular'},theme:{concept:'animal.cat',number:'singular'}
  },tense:'present',polarity:'positive',aspect:'habitual',wrappers:[]}
 }],unsupported:[]};
 assert.throws(()=>validateA1Gold(changed),/Invalid A1 gold oracle/);
});

test('VAL-04: supported aspect alternatives are explicit and unlicensed composition is refused',()=>{
 const translated=engine.translate({
  text:'The girl gave the boy a book.',from:'en',to:'pl'
 });
 assert.ok(translated.alternatives.includes('Dziewczynka dawała chłopcu książkę.'));
 assert.ok(translated.warnings.some(warning=>/aspect/i.test(warning)));

 const unsupported=composition.unsupported[0];
 const refused=engine.tryTranslate({text:unsupported.input,from:unsupported.from,to:unsupported.to});
 assert.equal(refused.ok,false,unsupported.id);
 assert.ok(refused.error?.message,unsupported.id+' needs a diagnostic');
});

test('VAL-04: Interlingua rejects undeclared fields instead of carrying fabricated metadata',()=>{
 const document=engine.analyze({text:'The girl saw the dog.',from:'en'});
 document.fabricatedResult={accepted:true};
 assert.throws(()=>engine.realize({interlingua:document,to:'pl'}),/unsupported fields/);
 const refused=engine.tryTranslate({text:JSON.stringify(document),from:'core',to:'pl'});
 assert.equal(refused.ok,false);
 assert.match(refused.error.message,/unsupported fields/);
});
