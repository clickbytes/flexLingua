import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createMorphology } from '../js/core/morphology/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import { createCoreLanguage } from '../js/core/core-language.js';
import { createLexicon, migrateLexicon } from '../js/core/lexicon.js';

const load = async path => JSON.parse(await readFile(new URL(`../data/${path}`, import.meta.url),'utf8'));
const [concepts,features,en,pl,tr,enGrammar,plGrammar,trGrammar,enMorphSpec,plMorphSpec,morphFeatures] = await Promise.all([
  'concepts.json','features.json','en.json','pl.json','tr.json',
  'grammar/en.json','grammar/pl.json','grammar/tr.json',
  'morphology/en.json','morphology/pl.json','morphology/features.json'].map(load));
const core = createCoreLanguage(concepts);
const engine = new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(tr,trGrammar));
engine.registerMorphology(createMorphology(enMorphSpec,en,morphFeatures,{core}));
engine.registerMorphology(createMorphology(plMorphSpec,pl,morphFeatures,{core}));
const copy = x => structuredClone(x);

test('CORE exposes concepts, typed operators and grammatical functions', () => {
  assert.equal(core.code,'core');
  assert.equal(core.version,'1.01');
  assert.equal(core.resolve({kind:'concept',id:'animal.cat'}).type,'entity');
  assert.match(core.resolve({kind:'operator',id:'logic.negation'}).label,/negation/i);
  assert.match(core.resolve({kind:'grammaticalFunction',id:'grammar.complementizer'}).label,/complement/i);
  assert.ok(core.list('concept').includes('event.visual_perception'));
  assert.equal(engine.capabilities().coreLanguage.code,'core');
  assert.equal(engine.capabilities().languages.length,3);
});

test('every canonical EN/PL lexeme and its senses are bound to existing CORE entries', () => {
  for (const data of [en,pl]) {
    const index = createLexicon(data,{strict:true});
    assert.equal(index.validateCore(core),true);
    assert.equal(index.entries.length,data.nouns.length+data.verbs.length+data.adjectives.length+
      data.degrees.length+data.attitudes.length+data.quantifiers.length+data.functionWords.length+data.modals.length);
    for (const group of ['nouns','verbs','adjectives','degrees','quantifiers','attitudes','functionWords','modals']) {
      for (const lex of data[group]) {
        assert.ok(!Object.hasOwn(lex,'concept'),`${lex.id} still uses direct concept`);
        assert.ok(lex.senses.length,lex.id);
        for (const sense of lex.senses) assert.ok(core.resolve(sense.coreRef),sense.id);
      }
    }
  }
  assert.ok(createLexicon(en,{strict:true}).count() >= 31);
  assert.ok(createLexicon(pl,{strict:true}).count() >= 26);
});

test('lexeme lookup is case-insensitive and returns stable distinct lexical senses', () => {
  const bank = engine.lookupLexemes({language:'en',lemma:'BANK'});
  assert.equal(bank.length,1);
  assert.deepEqual(bank[0].senses.map(s=>s.coreRef.id),
    ['place.financial_institution','place.riverbank']);
  assert.equal(engine.lookupLexemes({language:'pl',lemma:'KOT'})[0].senses[0].coreRef.id,'animal.cat');
  assert.equal(engine.lookupLexemes({language:'en',lemma:'nonexistent'}).length,0);
  assert.equal(engine.lexemesForCore({language:'pl',coreRef:{kind:'concept',id:'animal.cat'}})[0].lemma,'kot');
  assert.equal(engine.lexemesForCore({language:'en',coreRef:{kind:'concept',id:'animal.dog'}}).length,2);
});

test('at least ten approved polysemous sense pairs remain distinct in CORE', () => {
  let pairCount=0;
  for(const data of [en,pl])for(const group of Object.values(data))if(Array.isArray(group)){
    for(const lexeme of group.filter(entry=>Array.isArray(entry.senses)&&entry.senses.length>1)){
      const coreIds=lexeme.senses.map(sense=>sense.coreRef.id);
      const distinctMeanings=new Set(coreIds);
      if(distinctMeanings.size>1){
        assert.equal(distinctMeanings.size,coreIds.length,`${lexeme.id} meanings were merged`);
        pairCount+=distinctMeanings.size*(distinctMeanings.size-1)/2;
      }
    }
  }
  assert.ok(pairCount>=10,`expected at least 10 distinct sense pairs, found ${pairCount}`);

  const expected = {
    pilot: ['person.pilot','object.remote_control'],
    port: ['place.harbor','beverage.port_wine']
  };
  for (const [language,data,prefix] of [['en',en,'en'],['pl',pl,'pl']]) {
    for (const [lemma,conceptIds] of Object.entries(expected)) {
      const lexeme=engine.lookupLexemes({language,lemma})[0];
      assert.ok(lexeme,`${language} ${lemma}`);
      assert.deepEqual(lexeme.senses.map(sense=>sense.coreRef.id),conceptIds);
      assert.equal(new Set(lexeme.senses.map(sense=>sense.id)).size,2);
      assert.ok(lexeme.senses.every(sense=>sense.id.startsWith(`${prefix}.${lemma}.`)));
    }
  }
  assert.deepEqual(engine.lookupLexemes({language:'en',lemma:'bank'})[0].senses.map(s=>s.coreRef.id),
    ['place.financial_institution','place.riverbank']);
  assert.deepEqual(engine.lookupLexemes({language:'en',lemma:'mouse'})[0].senses.map(s=>s.coreRef.id),
    ['animal.mouse','device.computer_mouse']);
});

test('explicit topics rank polysemous readings while unsupported context preserves ambiguity', () => {
  for (const [language,word,topic,preferred] of [
    ['en','pilot','physical_object','object.remote_control'],
    ['pl','pilota','physical_object','object.remote_control'],
    ['en','port','beverage','beverage.port_wine'],
    ['pl','portu','beverage','beverage.port_wine']
  ]) {
    const bare=engine.resolveWord({language,text:word});
    assert.deepEqual(new Set(bare.map(reading=>reading.coreRef.id)),
      new Set(preferred==='object.remote_control' ? ['person.pilot','object.remote_control'] :
        ['place.harbor','beverage.port_wine']),
      `${language} ${word} keeps both meanings without evidence`);
    const ranked=engine.resolveWord({language,text:word,context:{topics:[topic]}});
    assert.deepEqual(new Set(ranked.map(reading=>reading.coreRef.id)),
      new Set(bare.map(reading=>reading.coreRef.id)),`${language} ${word} topic does not filter`);
    assert.equal(ranked[0].coreRef.id,preferred,
      `${language} ${word} explicit topic should change the preferred reading`);
  }
  const unqualified=engine.analyzeCandidates({text:'The girl sees the pilot.',from:'en'});
  const meanings=new Set(unqualified.map(candidate=>candidate.interlingua.roles.theme.concept));
  assert.deepEqual(meanings,new Set(['person.pilot','object.remote_control']));
  const personContext=engine.analyzeCandidates({text:'The girl sees the pilot.',from:'en',
    context:{topics:['person']}});
  assert.equal(personContext[0].interlingua.roles.theme.concept,'person.pilot');
  assert.ok(personContext.some(candidate=>candidate.interlingua.roles.theme.concept==='object.remote_control'));
});

test('grammatical function words and semantic operators have separate CORE references', () => {
  assert.equal(engine.lookupLexemes({language:'pl',lemma:'nie'})[0].senses[0].coreRef.id,'logic.negation');
  assert.equal(engine.lookupLexemes({language:'en',lemma:'not'})[0].senses[0].coreRef.kind,'operator');
  assert.equal(engine.lookupLexemes({language:'en',lemma:'the'})[0].senses[0].coreRef.kind,'grammaticalFunction');
  const that = engine.lookupLexemes({language:'en',lemma:'that'})[0];
  assert.deepEqual(that.senses.map(s=>s.coreRef.id),['grammar.complementizer','grammar.relative_marker']);
  assert.equal(engine.lexemesForCore({language:'en',coreRef:{kind:'operator',id:'quantifier.exact',
    parameters:{value:2}}})[0].lemma,'two');
  assert.equal(engine.lexemesForCore({language:'en',coreRef:{kind:'operator',id:'quantifier.exact',
    parameters:{value:3}}})[0].lemma,'three');
});

test('CORE is a reversible JSON Interlingua wire language, not another natural-language grammar', () => {
  const source = 'The girl saw the dog.';
  const toCore = engine.translate({text:source,from:'en',to:'core'});
  const parsed = JSON.parse(toCore.text);
  assert.equal(parsed.roles.theme.concept,'animal.dog');
  assert.deepEqual(parsed,toCore.interlingua);
  assert.equal(engine.translate({text:toCore.text,from:'core',to:'pl'}).text,'Dziewczynka widziała psa.');
  assert.equal(engine.translate({text:toCore.text,from:'core',to:'en'}).text,source);
  assert.deepEqual(engine.analyze({text:toCore.text,from:'core'}),parsed);
  assert.equal(engine.translate({text:'Dziewczynka widziała psa.',from:'pl',to:'core'}).interlingua.roles.theme.concept,'animal.dog');
});

test('CORE parser rejects bad JSON, unsupported graphs, invalid features and unsafe keys', () => {
  assert.throws(()=>engine.analyze({from:'core',text:'not json'}),/Invalid CORE JSON/);
  assert.throws(()=>engine.analyze({from:'core',text:'null'}),/invalid/i);
  assert.throws(()=>engine.analyze({from:'core',text:'{"__proto__":{}}'}),/Unsafe CORE/);
  assert.throws(()=>engine.analyze({from:'core',text:'{"constructor":{}}'}),/Unsafe CORE/);
  assert.throws(()=>engine.analyze({from:'core',text:'{}'}),/invalid|unknown/i);
  assert.throws(()=>engine.analyze({from:'core',text:' '.repeat(200001)}),/document size/);
  assert.throws(()=>engine.analyze({from:'core',text:JSON.stringify({type:'event',version:'0.2',
    concept:'event.nonexistent',roles:{},features:{}})}),/Unknown/);
});

test('CORE reference validator rejects missing IDs, bad parameter domains and malicious paths', () => {
  for (const value of [
    {kind:'operator',id:'quantifier.exact'},
    {kind:'operator',id:'quantifier.exact',parameters:{value:'2'}},
    {kind:'operator',id:'logic.negation',parameters:{anything:1}},
    {kind:'concept',id:'animal.cat',parameters:{value:2}},
    {kind:'grammaticalFunction',id:'missing.function'},
    {kind:'concept',id:'__proto__'},
    {kind:'concept',id:'animal.cat',malicious:'yes'}
  ]) assert.throws(()=>core.resolve(value));
  assert.equal(core.resolve({kind:'operator',id:'quantifier.exact',parameters:{value:0}}).label,'exact cardinality');
  assert.equal(core.reference('operator','quantifier.exact',{value:2}).id,'quantifier.exact');
});

test('canonical validator rejects dangling CORE references and wrong semantic types', () => {
  const missing=copy(en);
  missing.nouns[0].senses[0].coreRef.id='object.nonexistent';
  assert.throws(()=>createLexicon(missing,{strict:true}).validateCore(core),/Unknown CORE reference/);
  const wrong=copy(en);
  wrong.nouns[0].senses[0].coreRef.id='event.visual_perception';
  assert.throws(()=>createLexicon(wrong,{strict:true}).validateCore(core),/Invalid CORE concept type/);
  const bad=copy(en);
  bad.functionWords[0].senses[0].coreRef.id='grammar.nonexistent';
  assert.throws(()=>createLexicon(bad,{strict:true}).validateCore(core),/Unknown CORE/);
  const malformed=copy(en);
  malformed.quantifiers[1].senses[0].coreRef.parameters.value=3;
  assert.throws(()=>createLexicon(malformed,{strict:true}),/Incompatible quantifier CORE/);
});

test('canonical model rejects missing senses, duplicates and legacy-only source entries', () => {
  const missing=copy(pl);delete missing.nouns[0].senses;
  assert.throws(()=>createLexicon(missing,{strict:true}),/Canonical CORE/);
  const duplicate=copy(pl);duplicate.verbs[0].senses[0].id=duplicate.nouns[0].senses[0].id;
  assert.throws(()=>createLexicon(duplicate,{strict:true}),/duplicate lexical sense/);
  const old=copy(pl);old.nouns[0].concept='animal.cat';
  assert.throws(()=>createLexicon(old,{strict:true}),/Canonical CORE/);
  const nonexistent=copy(pl);delete nonexistent.lexicalModel;
  assert.throws(()=>createLexicon(nonexistent,{strict:true}),/lexical model/);
});

test('legacy Turkish data is normalized for runtime but not silently claimed as migrated', () => {
  const runtime=createLexicon(tr);
  assert.equal(runtime.lexicalModel,'1.0');
  assert.equal(runtime.lookup('köpek')[0].senses[0].coreRef.id,'animal.dog');
  assert.equal(runtime.validateCore(core),true);
  assert.throws(()=>createLexicon(tr,{strict:true}),/lexical model/);
  const migrated=migrateLexicon(tr);
  assert.equal(migrated.lexicalModel,'1.01');
  assert.equal(createLexicon(migrated,{strict:true}).validateCore(core),true);
  assert.equal(tr.nouns[0].concept,'person.girl');
  assert.ok(!Object.hasOwn(migrated.nouns[0],'concept'));
  assert.deepEqual(migrateLexicon(migrated),migrated);
});

test('polysemous adjectives can bind multiple concepts without duplicate lexical IDs', () => {
  const ontology=copy(concepts);
  ontology.concepts['quality.important']={type:'property',label:'significant',appliesTo:['entity']};
  const d=copy(en);
  d.adjectives[0].senses.push({id:'en.big.adj.important',coreRef:{kind:'concept',id:'quality.important'},priority:-1});
  const e=new Engine(ontology,features).registerLanguage(createRuleAdapter(d,enGrammar));
  const readings=e.analyzeCandidates({text:'The big girl saw the dog.',from:'en'});
  assert.ok(readings.length>=2);
  assert.deepEqual(new Set(readings.map(x=>x.interlingua.roles.agent.modifiers[0].concept)),
    new Set(['quality.big','quality.important']));
  assert.equal(e.lookupLexemes({language:'en',lemma:'big'})[0].senses.length,2);
});

test('lexicon snapshots input and publishes immutable lookup results', () => {
  const d=copy(pl);
  const index=createLexicon(d,{strict:true});
  d.nouns[0].senses[0].coreRef.id='animal.cat';
  assert.equal(index.lookup('dziewczynka')[0].senses[0].coreRef.id,'person.girl');
  assert.ok(Object.isFrozen(index.lookup('dziewczynka')[0].senses[0].coreRef));
  assert.ok(Object.isFrozen(index.lookup('dziewczynka')));
});
