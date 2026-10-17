import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const gold8=JSON.parse(await readFile(new URL('../tests/fixtures/gold-a1-third-person.json',import.meta.url),'utf8'));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('E2a: resolves he/she and on/ona only against a single preceding person',()=>{
  const engine=make();
  for(const [from,to,source,expected,role] of [
    ['en','pl','The girl sees the dog. She sees the cat.',
      'Dziewczynka widzi psa. Dziewczynka widzi kota.','agent'],
    ['en','pl','The girl sees the boy. He sees the cat.',
      'Dziewczynka widzi chłopca. Chłopiec widzi kota.','theme'],
    ['en','pl','The boy sees the girl. She sees the cat.',
      'Chłopiec widzi dziewczynkę. Dziewczynka widzi kota.','theme'],
    ['pl','en','Dziewczynka widzi psa. Ona widzi kota.',
      'A girl sees a dog. A girl sees a cat.','agent'],
    ['pl','en','Chłopiec widzi dziewczynkę. Ona widzi kota.',
      'A boy sees a girl. A girl sees a cat.','theme'],
    ['pl','en','Dziewczynka widzi chłopca. On widzi kota.',
      'A girl sees a boy. A boy sees a cat.','theme']
  ]){
    const result=engine.translate({text:source,from,to});
    assert.equal(result.text,expected,source);
    assert.equal(result.interlingua.type,'discourse');
    assert.equal(result.interlingua.events[1].roles.agent,
      result.interlingua.events[0].roles[role]);
    assert.equal(result.interlingua.events[0].roles.agent===
      result.interlingua.events[0].roles.theme,false);
    assert.equal(validateInterlingua(result.interlingua,engine.ontology,engine.features),
      result.interlingua);
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}),
      result.interlingua);
    assert.ok(result.warnings.some(w=>/target repeats the noun phrase/i.test(w)));
  }
});

test('A1-ENPL-08: no-context third-person readings preserve a typed unresolved referent',()=>{
  const engine=make();
  assert.equal(gold8.provenance.source,'project-authored');
  assert.ok(gold8.provenance.author);
  assert.ok(gold8.provenance.rights);
  assert.ok(gold8.provenance.review);
  assert.equal(gold8.provenance.reviewedAt,'2026-10-17');
  for(const [rows,from,to] of [[gold8.enToPl,'en','pl'],[gold8.plToEn,'pl','en']]){
    for(const row of rows){
      const sourceCore=engine.analyze({text:row.input,from});
      const translated=engine.translate({text:row.input,from,to});
      assert.deepEqual(sourceCore,row.core,row.id+' source CORE');
      assert.equal(translated.text,row.expected,row.id+' target surface');
      assert.deepEqual(translated.interlingua,row.core,row.id+' translated CORE');
      const reverseCore=structuredClone(row.core);
      for(const adjustment of row.reverseAdjustments||[]){
        if(adjustment.scope==='features')reverseCore.features[adjustment.feature]=adjustment.value;
        else reverseCore.roles[adjustment.role].features[adjustment.feature]=adjustment.value;
      }
      assert.deepEqual(engine.analyze({text:row.expected,from:to}),reverseCore,row.id+' reverse CORE');
      for(const ref of Object.values(row.core.roles||{})){
        if(ref.referent?.kind==='anaphoric')
          assert.equal(Object.hasOwn(ref,'concept'),false,row.id+' has no lexical person identity');
      }
    }
  }
  for(const row of gold8.invalid){
    const result=engine.tryTranslate({text:row.input,from:row.from,to:'pl'});
    assert.equal(result.ok,false,row.id);
    assert.equal(result.error.code,row.reasonCode,row.id);
  }
});

test('E2a: conflicting or missing antecedents fail with deterministic error codes',()=>{
  const engine=make();
  for(const [source,from,code] of [
    ['The girl sees the girl. She sees the dog.','en','AMBIGUOUS_ANAPHORA'],
    ['The boy sees the dog. She sees the cat.','en','UNRESOLVED_ANAPHORA'],
    ['The girl sees the dog. He sees the cat.','en','UNRESOLVED_ANAPHORA'],
    ['The girl sees the dog. Ona sees the cat.','en','UNSUPPORTED_CONSTRUCTION'],
    ['The girls see the dog. She sees the cat.','en','UNRESOLVED_ANAPHORA'],
    ['Chłopiec widzi chłopca. On widzi kota.','pl','AMBIGUOUS_ANAPHORA'],
    ['Chłopiec widzi psa. Ona widzi kota.','pl','UNRESOLVED_ANAPHORA']
  ]){
    const result=engine.tryTranslate({text:source,from,to:from==='en'?'pl':'en'});
    assert.equal(result.ok,false,source);
    assert.equal(result.error.code,code,source);
  }
});

test('E2a: coreference constraints and manual sense selection never mix with auto-anaphora',()=>{
  const engine=make();
  const text='The girl sees the dog. She sees the cat.';
  for(const context of [
    {coreference:{'e2.agent':'e1.agent'}},
    {coreference:{}},
    {senses:{theme:'animal.cat'}}
  ]){
    const result=engine.tryTranslate({text,from:'en',to:'pl',context});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'UNRESOLVED_ANAPHORA');
  }
});

test('E2a: preserves polysemous non-anaphoric roles as multiple CORE readings',()=>{
  const engine=make();
  const readings=engine.analyzeCandidates({
    text:'The girl sees the bank. She sees the cat.',from:'en'});
  assert.equal(readings.length,2);
  assert.deepEqual(new Set(readings.map(item=>item.interlingua.entities[
    item.interlingua.events[0].roles.theme].concept)),
    new Set(['place.financial_institution','place.riverbank']));
  assert.ok(readings.every(item=>item.interlingua.events[0].roles.agent===
    item.interlingua.events[1].roles.agent));
});

test('E2a: existing discourse without pronouns keeps separate entity identities',()=>{
  const engine=make();
  const source='The girl sees the dog. The girl sees the cat.';
  const original=engine.analyze({text:source,from:'en'});
  assert.notEqual(original.events[0].roles.agent,original.events[1].roles.agent);
  const explicit=engine.analyze({text:source,from:'en',
    context:{coreference:{'e2.agent':'e1.agent'}}});
  assert.equal(explicit.events[0].roles.agent,explicit.events[1].roles.agent);
  assert.equal(engine.translate({text:'The girl sees the dog.',from:'en',to:'pl'}).text,
    'Dziewczynka widzi psa.');
});

test('A1-ENPL-08: pronoun inventory declares agreement and never maps to a person concept',()=>{
  const broken=structuredClone(eg);
  assert.deepEqual(broken.anaphora.subjectPronouns[0].agreement,
    {person:'third',number:'singular',gender:'feminine'});
  broken.anaphora.subjectPronouns[0].agreement.gender='unknown';
  assert.throws(()=>makeWith(en,broken,pl,pg),/subject pronoun declaration/);
  const wrongGender=structuredClone(en);
  wrongGender.nouns.find(noun=>noun.id==='en.girl.1').gender='unknown';
  assert.throws(()=>createRuleAdapter(wrongGender,eg),/lexical grammatical gender/);
  broken.anaphora.subjectPronouns[0].text='<script>';
  assert.throws(()=>createRuleAdapter(en,broken),/subject pronoun declaration/);
  const duplicate=structuredClone(eg);
  duplicate.anaphora.subjectPronouns[1].text='she';
  assert.throws(()=>createRuleAdapter(en,duplicate),/subject pronoun declaration/);
  function makeWith(enData,enRules,plData,plRules) {
    return new Engine(concepts,features)
      .registerLanguage(createRuleAdapter(enData,enRules))
      .registerLanguage(createRuleAdapter(plData,plRules));
  }
});
