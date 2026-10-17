import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
const [concepts,features,en,enGrammar,fixture]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/grammar/en.json',
  'tests/fixtures/toy-nominals.json'
].map(load));

function makeEngine(qualified=fixture.qualified){
  const dictionary=copy(en),grammar=copy(enGrammar);
  dictionary.language=fixture.language;
  grammar.language=fixture.language;
  grammar.nounPhrase.qualified=copy(qualified);
  return new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(en,enGrammar))
    .registerLanguage(createRuleAdapter(dictionary,grammar));
}

test('toy grammar parses pre- and post-nominal modifiers to the same CORE',()=>{
  const engine=makeEngine();
  const before=engine.analyze({
    text:'The big very red girl sees the book.',from:fixture.language
  });
  const after=engine.analyze({
    text:'The girl big very red sees the book.',from:fixture.language
  });

  assert.deepEqual(after,before);
  assert.deepEqual(before.roles.agent.modifiers,[
    {concept:'quality.big',modifiers:[{concept:'degree.very'}]},
    {concept:'quality.red'}
  ]);
  assert.equal(engine.realize({interlingua:before,to:fixture.language}).text,
    'The big very red girl sees the book.');
  assert.equal(engine.analyzeCandidates({
    text:'The girl big very red sees the book.',from:fixture.language
  }).length,1);
});

test('quantifier-selected post-nominal layout generates and parses without duplicate readings',()=>{
  const engine=makeEngine();
  const source=engine.analyze({text:'The girl sees two red books.',from:'en'});
  const target=engine.realize({interlingua:source,to:fixture.language});
  assert.equal(target.text,'The girl sees two books red.');
  assert.deepEqual(engine.analyze({text:target.text,from:fixture.language}),source);
});

test('malformed layouts and placement declarations fail closed',()=>{
  for(const layout of [
    ['quantifier','determiner','noun','noun','modifiers'],
    ['quantifier','determiner','modifiers'],
    ['quantifier','determiner','@verb','noun','modifiers']
  ]){
    const malformed=copy(fixture.qualified);
    malformed.layouts[1]=layout;
    assert.throws(()=>makeEngine(malformed),/layout|noun phrase/i);
  }
  const mismatch=copy(fixture.qualified);
  mismatch.adjectivePlacement='before';
  assert.throws(()=>makeEngine(mismatch),/layout|noun phrase/i);

  const duplicate=copy(fixture.qualified);
  duplicate.layouts[1]=copy(duplicate.layouts[0]);
  assert.throws(()=>makeEngine(duplicate),/layout/i);

  const badQuantifierLayout=copy(fixture.qualified);
  badQuantifierLayout.layoutByQuantifier.exact=2;
  assert.throws(()=>makeEngine(badQuantifierLayout),/layout/i);
});
