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

test('A1-ENPL-03 runs project-authored bare beverage gold in both directions',()=>{
  assert.equal(gold.schemaVersion,1);
  assert.equal(gold.license,'project-authored');
  for(const [rows,from,to] of [[gold.enToPl,'en','pl'],[gold.plToEn,'pl','en']]) {
    for(const row of rows) {
      const translated=engine.translate({from,to,text:row.input});
      assert.equal(translated.text,row.expected,row.id+' target surface');
      const expected={concept:'event.drink',agent:row.agentAnchor??row.agent,theme:row.concept,
        tense:'present',polarity:'positive'};
      assert.deepEqual(coreSignature(engine.analyze({from,text:row.input})),expected,
        row.id+' source CORE');
      assert.deepEqual(coreSignature(translated.interlingua),expected,row.id+' translated CORE');
      assert.deepEqual(coreSignature(engine.analyze({from:to,text:row.expected})),expected,
        row.id+' target CORE');
    }
  }
});

test('A1-ENPL-03 confines bare beverage nouns to the declared drink theme',()=>{
  for(const row of gold.invalid) {
    const result=engine.tryTranslate({from:row.from,to:row.from==='en'?'pl':'en',text:row.input});
    assert.equal(result.ok,false,row.id+' should be explicitly refused');
  }
  assert.equal(engine.translate({from:'en',to:'pl',text:'I drink the water.'}).text,
    'Ja piję wodę.');
  assert.equal(engine.translate({from:'pl',to:'en',text:'Dziewczynka pije sok.'}).text,
    'A girl drinks a juice.');
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'I drink a book.'}).ok,false);
});

test('A1-ENPL-03 rejects bare-role concepts outside the typed beverage theme',()=>{
  const invalid=structuredClone(enGrammar);
  invalid.frames['event.drink'].bareRoleConcepts.theme.push('object.book');
  assert.throws(()=>new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(en,invalid)),/Invalid bare role concept for event\.drink\.theme/);
});
