import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,tr,eg,pg,tg,enMorph,morphFeatures]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','tr.json',
  'grammar/en.json','grammar/pl.json','grammar/tr.json',
  'morphology/en.json','morphology/features.json'
].map(read));
const language=(dictionary,grammar)=>createRuleAdapter(dictionary,grammar);

test('MULTI-01: one neutral CORE hosts three adapter languages without pairwise paths',()=>{
  const engine=new Engine(concepts,features)
    .registerLanguage(language(en,eg)).registerLanguage(language(pl,pg))
    .registerLanguage(language(tr,tg));
  assert.equal(engine.capabilities().languageAdapterContractVersion,'1.0');
  assert.deepEqual(engine.capabilities().languages.map(item=>item.code),['en','pl','tr']);
  const core=engine.analyze({text:'The girl saw the dog.',from:'en'});
  assert.equal(engine.realize({interlingua:core,to:'tr'}).text,'Kız köpeği gördü.');
  assert.equal(engine.realize({interlingua:core,to:'pl'}).text,'Dziewczynka widziała psa.');
  assert.equal(engine.translate({text:'Kız köpeği gördü.',from:'tr',to:'en'}).text,
    'A girl saw the dog.');
});

test('MULTI-01: invalid contract, mismatched grammar and unknown CORE data fail at registration',()=>{
  const engine=new Engine(concepts,features);
  const adapter=language(en,eg);
  assert.throws(()=>engine.registerLanguage({...adapter,contractVersion:'2.0'}),
    /adapter contract/);
  assert.throws(()=>engine.registerLanguage({...adapter,analyzeCandidates:null}),
    /adapter contract/);
  assert.throws(()=>engine.registerLanguage({...adapter,describe:()=>({
    language:'pl',grammarVersion:'1.0'})}),/description/);
  assert.throws(()=>language(en,pg),/mismatch/);
  assert.equal(engine.capabilities().languages.length,0);
});

test('MULTI-01: morphology reports missing cells and unknown features without guessing',()=>{
  const engine=new Engine(concepts,features);
  const morphology=createMorphology(enMorph,en,morphFeatures);
  assert.throws(()=>engine.registerMorphology({...morphology,contractVersion:'2.0'}),
    /adapter contract/);
  engine.registerMorphology(morphology);
  assert.equal(engine.capabilities().morphologyAdapterContractVersion,'1.0');
  assert.deepEqual(engine.morphologyAvailability({language:'en',lexemeId:'en.dog.1',
    features:{number:'plural'}}),{supported:true,reason:null});
  assert.deepEqual(engine.morphologyAvailability({language:'en',lexemeId:'en.dog.1',
    features:{number:'dual'}}),{supported:false,reason:'missing_or_blocked_cell'});
  assert.deepEqual(engine.morphologyAvailability({language:'en',lexemeId:'en.dog.1',
    features:{number:'hax'}}),{supported:false,reason:'unsupported_feature'});
  assert.deepEqual(engine.morphologyAvailability({language:'en',lexemeId:'missing',
    features:{number:'plural'}}),{supported:false,reason:'unknown_lexeme'});
});
