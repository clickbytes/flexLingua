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
const featureProfiles=JSON.parse(await readFile(new URL('./fixtures/language-feature-profiles.json',import.meta.url),'utf8'));
const language=(dictionary,grammar)=>createRuleAdapter(dictionary,grammar);
const copy=value=>structuredClone(value);

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

test('Language adapter registration checks opt-in zero, two, and ten case profiles against grammar',()=>{
  const ten=copy(featureProfiles.tenCase);ten.language='en';
  const tenEngine=new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(en,eg,{featureProfile:ten}));
  assert.equal(tenEngine.capabilities().languages[0].featureProfile.syntactic.case.length,10);

  const two=copy(featureProfiles.twoCase);two.language='en';
  const twoCaseGrammar=copy(eg);
  const normalizeLocative=value=>{
    if(Array.isArray(value))return value.map(normalizeLocative);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>
      [key,normalizeLocative(item)]));
    return value==='loc'?'nom':value;
  };
  Object.assign(twoCaseGrammar,normalizeLocative(twoCaseGrammar));
  const twoEngine=new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(en,twoCaseGrammar,{featureProfile:two}));
  assert.equal(twoEngine.capabilities().languages[0].featureProfile.syntactic.case.length,2);
  const inconsistent=copy(two);inconsistent.syntactic.case=['nom'];
  assert.throws(()=>createRuleAdapter(en,twoCaseGrammar,{featureProfile:inconsistent}),
    /Invalid deictic pronoun declaration/);

  const zero=copy(featureProfiles.zeroCase);zero.language='en';
  const caseFreeGrammar=copy(eg);
  delete caseFreeGrammar.comparison;
  delete caseFreeGrammar.deicticPronouns;
  delete caseFreeGrammar.passive;
  delete caseFreeGrammar.nounPhrase.subjectCase;
  for(const frame of Object.values(caseFreeGrammar.frames))delete frame.cases;
  delete caseFreeGrammar.states;
  const caseFreeDictionary=copy(en);
  const stateFunctions=new Set(['grammar.state_copula','grammar.state_possession','grammar.state_location']);
  for(const verb of caseFreeDictionary.verbs){
    verb.senses=verb.senses.filter(sense=>!stateFunctions.has(sense.coreRef?.id));
  }
  caseFreeDictionary.verbs=caseFreeDictionary.verbs.filter(verb=>verb.senses.length);
  const zeroEngine=new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(caseFreeDictionary,caseFreeGrammar,{featureProfile:zero}));
  assert.deepEqual(zeroEngine.capabilities().languages[0].featureProfile.syntactic,{});

  const morphologyProfile={...ten,syntactic:{case:[...ten.syntactic.case]},
    morphology:copy(morphFeatures.dimensions)};
  const packageWithProfile={...copy(enMorph),featureProfile:morphologyProfile};
  const morphologyEngine=new Engine(concepts,features)
    .registerMorphology(createMorphology(packageWithProfile,en,morphFeatures));
  assert.equal(morphologyEngine.capabilities().morphologies[0].featureProfile.version,'1.0');
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
    features:{number:'hax'}}),{supported:false,reason:'unknown_feature_value'});
  assert.deepEqual(engine.morphologyAvailability({language:'en',lexemeId:'missing',
    features:{number:'plural'}}),{supported:false,reason:'unknown_lexeme'});
});
