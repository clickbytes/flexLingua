import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,morphFeatures,enMorphData,plMorphData]=
  await Promise.all([
    'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json',
    'morphology/features.json','morphology/en.json','morphology/pl.json'
  ].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(enMorphData,en,morphFeatures,{core});
const plMorph=createMorphology(plMorphData,pl,morphFeatures,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,enGrammar,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,plGrammar,{morphology:plMorph}));

test('object pronouns carry person and case separately from lexical CORE senses',()=>{
  for(const dictionary of [en,pl]){
    for(const word of dictionary.functionWords.filter(item=>item.pos==='PRON')){
      for(const sense of word.senses){
        assert.equal(sense.coreRef.kind,'grammaticalFunction',word.id);
        assert.equal(sense.coreRef.id,'grammar.deictic_pronoun',word.id);
      }
    }
  }
  for(const [text,from,to,expected,anchor,person,number] of [
    ['I see you.','en','pl','Ja widzę ciebie.','addressee','second','singular'],
    ['You see me.','en','pl','Ty widzisz mnie.','speaker','first','singular'],
    ['Ja widzę ciebie.','pl','en','I see you.','addressee','second','singular'],
    ['Ja daję mi książkę.','pl','en','I give me a book.','speaker','first','singular'],
    ['Ja daję tobie książkę.','pl','en','I give you a book.','addressee','second','singular']
  ]){
    const result=engine.translate({text,from,to});
    assert.equal(result.text,expected,text);
    const role=text.includes('daję')?'recipient':'theme';
    assert.deepEqual(result.interlingua.roles[role],{
      referent:{kind:'deictic',anchor},agreement:{person,number}
    },text);
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
      result.interlingua);
  }
});

test('case mismatches are refused instead of treating a dative pronoun as an object',()=>{
  for(const text of ['Ja widzę mi książkę.','Ja widzę tobie książkę.']){
    const result=engine.tryTranslate({text,from:'pl',to:'en'});
    assert.equal(result.ok,false,text);
    assert.match(result.error.message,/does not match a supported grammatical construction/u);
  }
});

test('possessive determiners use a typed possessor on the noun referent',()=>{
  for(const [text,from,to,expected,anchor,person,number] of [
    ['I see my book.','en','pl','Ja widzę moją książkę.','speaker','first','singular'],
    ['Ja widzę moją książkę.','pl','en','I see my book.','speaker','first','singular'],
    ['You see your book.','en','pl','Ty widzisz twoją książkę.','addressee','second','singular'],
    ['Ja widzę twoją książkę.','pl','en','I see your book.','addressee','second','singular']
  ]){
    const result=engine.translate({text,from,to});
    assert.equal(result.text,expected,text);
    assert.equal(result.interlingua.version,'1.26',text);
    const owned=result.interlingua.roles.theme;
    assert.equal(owned.concept,'object.book');
    assert.deepEqual(owned.possessor,{
      referent:{kind:'deictic',anchor},agreement:{person,number}
    });
    assert.equal(owned.features.definiteness,'definite');
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
      result.interlingua);
  }
  const your=engine.analyzeCandidates({text:'You see your book.',from:'en'});
  assert.deepEqual(new Set(your.map(item=>item.interlingua.roles.theme.possessor.agreement.number)),
    new Set(['singular','plural']));
});

test('mine is accepted as a possessive predicate but refused without a known possessee',()=>{
  const result=engine.translate({text:'The book is mine.',from:'en',to:'pl'});
  assert.equal(result.text,'Mam moją książkę.');
  assert.equal(result.interlingua.version,'1.26');
  assert.equal(result.interlingua.kind,'possession');
  assert.deepEqual(result.interlingua.roles.owner,{
    referent:{kind:'deictic',anchor:'speaker'},agreement:{person:'first',number:'singular'}
  });
  assert.equal(result.interlingua.roles.owned.concept,'object.book');
  assert.deepEqual(result.interlingua.roles.owned.possessor,result.interlingua.roles.owner);
  const polish=engine.translate({text:'Książka jest moja.',from:'pl',to:'en'});
  assert.equal(polish.text,'I have my book.');
  assert.deepEqual(polish.interlingua.roles.owner,result.interlingua.roles.owner);
  assert.deepEqual(polish.interlingua.roles.owned.possessor,result.interlingua.roles.owner);
  const malformed=structuredClone(result.interlingua);
  malformed.roles.owned.possessor.agreement.person='second';
  assert.throws(()=>engine.analyze({from:'core',text:JSON.stringify(malformed)}),
    /Invalid deictic participant/u);
  const legacyVersion=structuredClone(result.interlingua);
  legacyVersion.version='1.23';
  assert.throws(()=>engine.analyze({from:'core',text:JSON.stringify(legacyVersion)}),
    /v1\.26/u);

  const unbound=engine.tryTranslate({text:'I see mine.',from:'en',to:'pl'});
  assert.equal(unbound.ok,false);
  assert.match(unbound.error.message,/does not match a supported grammatical construction/u);
});

test('object-pronoun additions do not join identities across discourse events',()=>{
  const discourse=engine.analyze({text:'The girl sees the dog. The girl sees the dog.',from:'en'});
  assert.notEqual(discourse.events[0].roles.agent,discourse.events[1].roles.agent);
  const possessive=engine.analyze({text:'The girl sees my book. The girl sees my book.',from:'en'});
  assert.equal(possessive.version,'1.26');
  assert.notEqual(possessive.events[0].roles.theme,possessive.events[1].roles.theme);
  assert.notEqual(possessive.events[0].roles.agent,possessive.events[1].roles.agent);
});
