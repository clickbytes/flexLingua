import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar,gold]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','tests/fixtures/gold-a1-bare-beverages.json'
].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));

function coreSignature(node) {
  return {
    concept:node.concept,
    agent:node.roles.agent.referent?.anchor??node.roles.agent.concept,
    theme:node.roles.theme.concept,
    tense:node.features.tense,
    polarity:node.features.polarity
  };
}

test('A1-ENPL-11 runs project-authored mass-noun gold across frames in both directions',()=>{
  assert.equal(gold.schemaVersion,1);
  assert.equal(gold.license,'project-authored');
  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]) {
    for(const row of rows) {
      const translated=engine.translate({from,to,text:row.input});
      assert.equal(translated.text,row.expected,row.id+' target surface');
      const expected={concept:row.event??'event.drink',agent:row.agentAnchor??row.agent,theme:row.concept,
        tense:'present',polarity:'positive'};
      assert.deepEqual(coreSignature(engine.analyze({from,text:row.input})),expected,
        row.id+' source CORE');
      assert.deepEqual(coreSignature(translated.interlingua),expected,row.id+' translated CORE');
      assert.deepEqual(coreSignature(engine.analyze({from:to,text:row.expected})),expected,
        row.id+' target CORE');
      assert.equal(engine.analyzeCandidates({from,text:row.input}).length,1,
        row.id+' source has one reading');
      assert.equal(engine.analyzeCandidates({from:to,text:row.expected}).length,1,
        row.id+' target has one reading');
    }
  }
});

test('A1-ENPL-11 keeps count nouns, portion readings and invalid role types refused',()=>{
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(result.ok,false,row.id+' should be explicitly refused');
  }
  assert.equal(engine.translate({from:'en',to:'pl',text:'I drink the water.'}).text,
    'Ja piję wodę.');
  assert.equal(engine.translate({from:'pl',to:'en',text:'Dziewczynka pije sok.'}).text,
    'A girl drinks juice.');
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'I drink a book.'}).ok,false);
});

test('A1-ENPL-11 validates countability only on noun senses',()=>{
  const invalid=structuredClone(enGrammar);
  const badValue=structuredClone(en);
  badValue.nouns.find(noun=>noun.id==='en.water.1').senses[0].countability='liquid';
  assert.throws(()=>new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(badValue,invalid)),/Invalid or duplicate lexical sense/);
  const badPartOfSpeech=structuredClone(en);
  badPartOfSpeech.verbs.find(verb=>verb.id==='en.drink.1').senses[0].countability='mass';
  assert.throws(()=>new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(badPartOfSpeech,enGrammar)),/Invalid or duplicate lexical sense/);
});
