import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {runGoldAudit,verifyGoldNouns} from '../tools/verify-gold.mjs';

const load=async name=>JSON.parse(await readFile(new URL(`../${name}`,import.meta.url),'utf8'));
const [gold,ontology,features,featureRegistry,pl,en,plSpec,enSpec,plGrammar,enGrammar]=await Promise.all([
  'tests/fixtures/gold-nouns-v1.12.json','data/concepts.json','data/features.json','data/morphology/features.json',
  'data/pl.json','data/en.json','data/morphology/pl.json','data/morphology/en.json',
  'data/grammar/pl.json','data/grammar/en.json'].map(load));
const core=createCoreLanguage(ontology);
const plMorph=createMorphology(plSpec,pl,featureRegistry,{core});
const enMorph=createMorphology(enSpec,en,featureRegistry,{core});
const engine=new Engine(ontology,features)
  .registerMorphology(plMorph).registerMorphology(enMorph)
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}))
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}));

test('v1.12: 14 manually curated pairs pass 224 independent PL/EN surface-form and inverse checks', async()=>{
  assert.deepEqual(await runGoldAudit(),{languages:['pl','en'],lexemePairs:14,lexemes:28,validatedCells:224,inverseCells:224});
});

test('v1.12: a faulty oracle is rejected rather than accepting a generator roundtrip',()=>{
  const invalid=structuredClone(gold);
  invalid.items[0].pl.singular.dat='domom'; // real form is domowi
  assert.throws(()=>verifyGoldNouns(invalid,{core,pl:plMorph,en:enMorph}),/Wrong generated form/);
  const dangling=structuredClone(gold);
  dangling.items[0].conceptId='unknown.house';
  assert.throws(()=>verifyGoldNouns(dangling,{core,pl:plMorph,en:enMorph}),/Unknown CORE reference/);
});

test('v1.12: all added nouns lack hand-written inflection tables but preserve typed CORE senses',()=>{
  assert.equal(gold.items.length,14);
  for(const row of gold.items)for(const [language,morph,data] of [['pl',plMorph,pl],['en',enMorph,en]]){
    const id=row[language].lexemeId;
    const lex=data.nouns.find(x=>x.id===id);
    assert.ok(lex,id);
    assert.equal(lex.forms,undefined,`${id} should not store explicit forms`);
    assert.ok(morph.has(id));
    assert.ok(lex.senses.some(x=>x.coreRef.id===row.conceptId));
    assert.equal(morph.lexicon.forCore({kind:'concept',id:row.conceptId}).some(x=>x.lexemeId===id),true);
  }
});

test('v1.12: new paradigms and exceptions are shared JSON rules, including city/cities and mouse/mice',()=>{
  assert.equal(enMorph.generate({lexemeId:'en.city.1',features:{number:'plural'}})[0].text,'cities');
  assert.equal(enMorph.generate({lexemeId:'en.mouse.1',features:{number:'plural'}})[0].text,'mice');
  assert.equal(enMorph.generate({lexemeId:'en.woman.1',features:{number:'plural'}})[0].text,'women');
  assert.equal(plMorph.generate({lexemeId:'pl.mysz.1',features:{number:'plural',case:'dat'}})[0].text,'myszom');
  assert.equal(plMorph.generate({lexemeId:'pl.miasto.1',features:{number:'singular',case:'loc'}})[0].text,'mieście');
  assert.equal(plMorph.generate({lexemeId:'pl.ogrod.1',features:{number:'plural',case:'inst'}})[0].text,'ogrodami');
  assert.equal(enMorph.generate({lexemeId:'en.mouse.1',features:{number:'dual'}}).length,0);
});

test('v1.12: ambiguous mouse/mysz preserves two CORE meanings for every inflected form',()=>{
  for(const [language,morph,word] of [['pl',plMorph,'myszy'],['en',enMorph,'mice']]){
    const candidates=morph.analyze({text:word});
    assert.ok(candidates.length>0);
    for(const candidate of candidates){
      assert.deepEqual(new Set(candidate.coreRefs.map(x=>x.id)),
        new Set(['animal.mouse','device.computer_mouse']));
    }
    assert.deepEqual(new Set(engine.resolveWord({language,text:word}).map(x=>x.coreRef.id)),
      new Set(['animal.mouse','device.computer_mouse']));
  }
});

test('v1.12: every new noun composes with existing sentence grammar and CORE',()=>{
  for(const row of gold.items){
    const source=`The girl saw the ${row.en.singular}.`;
    const plSentence=`Dziewczynka widziała ${row.pl.singular.acc}.`;
    const rendered=engine.translate({text:source,from:'en',to:'pl'});
    assert.equal(rendered.text,plSentence,source);
    assert.equal(rendered.interlingua.roles.theme.concept,row.conceptId);
    const back=engine.analyze({text:plSentence,from:'pl'});
    assert.equal(back.roles.theme.concept,row.conceptId,plSentence);
  }
});

test('v1.12: legacy grammar adapters without morphological data retain old words but cannot fabricate new ones',()=>{
  const older=new Engine(ontology,features)
    .registerLanguage(createRuleAdapter(pl,plGrammar))
    .registerLanguage(createRuleAdapter(en,enGrammar));
  assert.equal(older.translate({text:'The girl saw the dog.',from:'en',to:'pl'}).text,'Dziewczynka widziała psa.');
  assert.throws(()=>older.translate({text:'The girl saw the bicycle.',from:'en',to:'pl'}),/Unrecognized|Unsupported|No .* reading|does not match a supported grammatical construction/);
});

test('v1.12: integrity rejects uncatalogued CORE semantics for new productive lexemes',()=>{
  const corrupt=structuredClone(pl);
  const id=gold.items[0].pl.lexemeId;
  corrupt.nouns.find(x=>x.id===id).senses[0].coreRef.id='unknown.entity';
  assert.throws(()=>createMorphology(plSpec,corrupt,featureRegistry,{core}),/Unknown CORE reference/);
});
