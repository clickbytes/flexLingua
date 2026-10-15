import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,enMorphSpec,plMorphSpec,morphFeatures,gold]=
  await Promise.all([
    'data/concepts.json','data/features.json','data/en.json','data/pl.json',
    'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json',
    'data/morphology/pl.json','data/morphology/features.json',
    'tests/fixtures/gold-a1-present-progressive.json'
  ].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphSpec,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphSpec,pl,morphFeatures,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));

const participant=ref=>ref.referent?.kind==='deictic'
  ?{anchor:ref.referent.anchor,person:ref.agreement.person,number:ref.agreement.number}
  :{concept:ref.concept,number:ref.features.number};
const signature=node=>({
  type:node.type,concept:node.concept,
  roles:Object.fromEntries(Object.entries(node.roles).map(([role,ref])=>[role,participant(ref)])),
  features:{tense:node.features.tense,polarity:node.features.polarity,aspect:node.features.aspect}
});

test('A1-ENPL-06 maps bounded English present progressive to imperfective CORE both ways',()=>{
  assert.equal(gold.license,'project-authored');
  assert.equal(gold.enToPl.length,6);
  assert.equal(gold.plToEn.length,6);
  const conceptsSeen=new Set();
  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]) {
    for(const row of rows) {
      const source=engine.analyze({from,text:row.input});
      const result=engine.translate({from,to,text:row.input});
      assert.equal(result.text,row.expected,row.id+' target surface');
      assert.deepEqual(signature(source),row.core,row.id+' source CORE');
      assert.deepEqual(signature(result.interlingua),row.core,row.id+' translated CORE');
      if(to==='pl') {
        assert.deepEqual(signature(engine.analyze({from:to,text:row.expected})),row.core,
          row.id+' target CORE');
      } else if(row.core.concept!=='event.read') {
        // English simple present does not encode lexical aspect, so it cannot
        // independently recover progressive/imperfective information.
        const targetCore=structuredClone(row.core);
        targetCore.features.aspect='unknown';
        assert.deepEqual(signature(engine.analyze({from:to,text:row.expected})),targetCore,
          row.id+' target CORE');
      }
      const roundTrip=engine.realize({interlingua:result.interlingua,to:'core'}).text;
      assert.deepEqual(engine.analyze({from:'core',text:roundTrip}),result.interlingua,
        row.id+' CORE round trip');
      conceptsSeen.add(row.core.concept);
      if(from==='pl') assert.doesNotMatch(result.text,/\b(?:am|is|are)\s+\w+ing\b/i,
        row.id+' Polish present must not invent progressive aspect');
    }
  }
  assert.deepEqual(conceptsSeen,new Set(['event.read','event.write','event.eat','event.drink','event.help','event.open']));
});

test('A1-ENPL-06 refuses forms outside its positive present event contract',()=>{
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(result.ok,false,row.id+' should be refused');
  }
});

test('A1-ENPL-06 keeps simple do-support questions unambiguous',()=>{
  for(const text of ['Does the mother write a book?','Does the girl read a book?',
      'Does the girl eat a sandwich?','Does the girl drink tea?',
      'Does the father help the sister?','Does the father open a book?']) {
    const readings=engine.analyzeCandidates({from:'en',text});
    assert.equal(readings.length,1,text);
    assert.equal(readings[0].interlingua.proposition.features.aspect,'unknown',
      text+' remains simple present');
  }
});

test('A1-ENPL-06 grammar rejects an unrecognized progressive aspect label',()=>{
  const invalid=structuredClone(enGrammar);
  invalid.verb.rules.find(rule=>rule.path==='forms.progressive').aspect='progressive';
  assert.throws(()=>createRuleAdapter(en,invalid,{morphology:enMorph}),/Invalid declarative verb rule/);
});
