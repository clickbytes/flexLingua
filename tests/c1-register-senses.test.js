import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,mf,em,pm,matrix]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json',
  'morphology/features.json','morphology/en.json','morphology/pl.json','coverage/c1-targets.json'
].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(em,en,mf,{core});
const plMorph=createMorphology(pm,pl,mf,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));

test('ADV-01 matrix has 30 distinct project-authored senses and unique formal lemmas',()=>{
  assert.equal(matrix.senses.length,30);
  assert.equal(new Set(matrix.senses.map(s=>s.id)).size,30);
  for(const language of ['en','pl'])
    assert.equal(new Set(matrix.senses.map(s=>s.formal[language])).size,30);
  for(const sense of matrix.senses){
    assert.match(sense.provenance,/project-authored/);
    for(const [language,dictionary] of [['en',en],['pl',pl]]){
      const formal=dictionary.nouns.find(n=>n.lemma===sense.formal[language]);
      assert.equal(formal?.senses[0]?.coreRef.id,sense.id);
      assert.equal(formal?.register,'formal');
      if(sense.plain){
        const plain=dictionary.nouns.find(n=>n.lemma===sense.plain[language]);
        assert.equal(plain?.senses[0]?.coreRef.id,sense.id);
        assert.equal(plain?.register,'plain');
      }
    }
  }
});

test('ADV-01 formal process nouns parse into separate CORE senses in EN and PL',()=>{
  for(const sense of matrix.senses){
    const english=engine.analyze({text:`The girl sees the ${sense.formal.en}.`,from:'en'});
    const polish=engine.analyze({text:`Dziewczynka widzi ${sense.formal.pl.replace(/cja$/u,'cję')}.`,from:'pl'});
    assert.equal(english.roles.theme.concept,sense.id,sense.id);
    assert.equal(polish.roles.theme.concept,sense.id,sense.id);
  }
});

test('ADV-01 changing register preserves CORE through EN-PL and PL-EN roundtrips',()=>{
  for(const sense of matrix.senses.filter(s=>s.plain)){
    for(const [from,to,source] of [
      ['en','pl',`The girl sees the ${sense.formal.en}.`],
      ['pl','en',`Dziewczynka widzi ${sense.formal.pl.replace(/cja$/u,'cję')}.`]
    ]){
      const formal=engine.translate({text:source,from,to,lexicalRegister:'formal'});
      const plain=engine.translate({text:source,from,to,lexicalRegister:'plain'});
      assert.equal(formal.interlingua.roles.theme.concept,sense.id);
      assert.equal(plain.interlingua.roles.theme.concept,sense.id);
      assert.notEqual(formal.text,plain.text);
      assert.equal(engine.analyze({text:formal.text,from:to}).roles.theme.concept,sense.id);
      assert.equal(engine.analyze({text:plain.text,from:to}).roles.theme.concept,sense.id);
      assert.deepEqual(engine.analyze({text:plain.text,from:to}),
        engine.analyze({text:formal.text,from:to}));
    }
  }
});

test('ADV-01 unavailable register warns and invalid choice fails',()=>{
  const result=engine.translate({text:'The girl sees the interpretation.',from:'en',to:'pl',lexicalRegister:'plain'});
  assert.match(result.warnings.join(' '),/No plain lexical variant/);
  assert.equal(result.interlingua.roles.theme.concept,'abstract.interpretation');
  assert.throws(()=>engine.translate({text:'The girl sees the interpretation.',from:'en',to:'pl',lexicalRegister:'slang'}),/Invalid lexical register/);
});
