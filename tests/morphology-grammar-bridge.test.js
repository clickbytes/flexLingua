import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const read=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
const [concepts,features,en,grammar,morphologyPackage,baseFeatures]=await Promise.all([
  'concepts.json','morphology/features.json','en.json','grammar/en.json','morphology/en.json','features.json'
].map(read));
const copy=value=>structuredClone(value);

test('grammar analysis accepts an added morphology variant and retains its CORE sense',()=>{
  const spec=copy(morphologyPackage);
  const binding=spec.bindings.find(item=>item.lexemeId==='en.dog.1');
  const singular=spec.paradigms[binding.paradigmId].slots.find(slot=>slot.features.number==='singular');
  binding.overrides.push({when:copy(singular.features),mode:'addVariant',
    forms:[{text:'doggo',variant:'colloquial'}]});
  const morphology=createMorphology(spec,en,features);
  const generated=morphology.generate({lexemeId:binding.lexemeId,features:singular.features});
  assert.deepEqual(generated.map(form=>form.text),['dog','doggo']);
  const morphologyReading=morphology.analyze({text:'doggo'})[0];
  assert.equal(morphologyReading.lexemeId,'en.dog.1');
  assert.deepEqual(morphologyReading.features,singular.features);

  const engine=new Engine(concepts,baseFeatures)
    .registerMorphology(morphology)
    .registerLanguage(createRuleAdapter(en,grammar,{morphology}));
  const [parsed]=engine.analyzeCandidates({text:'The girl saw the doggo.',from:'en'});
  const meaning=parsed.interlingua;
  assert.equal(meaning.type,'event');
  assert.equal(meaning.roles.theme.concept,'animal.dog');
  assert.equal(parsed.lexicalSenses.theme,en.nouns.find(noun=>noun.id==='en.dog.1').senses[0].id);
  assert.equal(engine.realize({interlingua:meaning,to:'en'}).text,'The girl saw the dog.');
  assert.equal(morphologyReading.coreRefs[0].id,
    morphology.paradigm({lexemeId:'en.dog.1'})[0].coreRefs[0].id);
});

test('same-path syncretic forms keep both grammatical readings through sentence parsing',()=>{
  const spec=copy(morphologyPackage);
  const binding=spec.bindings.find(item=>item.lexemeId==='en.dog.1');
  binding.overrides.push({when:{number:'plural'},mode:'addVariant',
    forms:[{text:'dog',variant:'syncretic'}]});
  const morphology=createMorphology(spec,en,features);
  const surfaceReadings=morphology.analyze({text:'dog'});
  assert.deepEqual(surfaceReadings.map(form=>form.features.number).sort(),['plural','singular']);
  const engine=new Engine(concepts,baseFeatures)
    .registerMorphology(morphology)
    .registerLanguage(createRuleAdapter(en,grammar,{morphology}));
  const meanings=engine.analyzeCandidates({text:'The girl saw the dog.',from:'en'})
    .map(item=>item.interlingua.roles.theme.features.number).sort();
  assert.deepEqual(meanings,['plural','singular']);
});

test('a blocked morphology cell removes its legacy fallback from the grammar adapter',()=>{
  const spec=copy(morphologyPackage);
  const binding=spec.bindings.find(item=>item.lexemeId==='en.dog.1');
  binding.overrides.push({when:{number:'singular'},mode:'block',forms:[]});
  const morphology=createMorphology(spec,en,features);
  const materialized=morphology.paradigm({lexemeId:binding.lexemeId});
  assert.equal(materialized.some(form=>form.features.number==='singular'),false);
  const engine=new Engine(concepts,baseFeatures)
    .registerMorphology(morphology)
    .registerLanguage(createRuleAdapter(en,grammar,{morphology}));
  assert.throws(()=>engine.analyze({text:'The girl saw the dog.',from:'en'}),/construction/);
});
